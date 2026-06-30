import type { Env, UserRow } from '../types';
import { sendEmail } from './emailService';
import { sendPushToUser } from './webPush';

interface ServerAvailabilityRow {
  id: string;
  availability_enabled: number;
  offline_since: number | null;
  last_online_at: number | null;
  availability_alerted: number;
}

const GRACE_SECONDS = 300;

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export async function checkServerAvailability(user: UserRow, env: Env): Promise<void> {
  try {
    const server = await env.DB.prepare(
      `SELECT id, availability_enabled, offline_since, last_online_at, availability_alerted
       FROM servers WHERE user_id = ?`
    ).bind(user.id).first<ServerAvailabilityRow>();

    if (!server || !server.availability_enabled) return;

    const now = Math.floor(Date.now() / 1000);
    let reachable = true;

    try {
      // Simple HTTP reachability check — any response (even 4xx/5xx) means the
      // host is up. Only a network failure or timeout means truly unreachable.
      await fetch(user.url, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
    } catch {
      reachable = false;
    }

    if (reachable) {
      const wasOffline = server.offline_since !== null;
      if (wasOffline) {
        const downtimeSec = now - server.offline_since!;
        const duration = formatDuration(downtimeSec);

        await env.DB.prepare(
          `UPDATE servers SET offline_since = NULL, availability_alerted = 0, last_online_at = ? WHERE id = ?`
        ).bind(now, server.id).run();

        await env.DB.prepare(
          `INSERT INTO monitor_events (user_id, monitor_type, monitor_id, monitor_name, detail, actions_taken)
           VALUES (?, 'server_availability', ?, 'Server Availability', ?, ?)`
        ).bind(
          user.id,
          server.id,
          JSON.stringify({ status: 'online', downtime_s: downtimeSec }),
          JSON.stringify(['record']),
        ).run();

        if (user.email_alerts) {
          await sendEmail(
            env,
            user.email,
            '[UnraidWatch] Server Back Online',
            `Your Unraid server is back online after being unreachable for ${duration}.\n\nView your dashboard: ${env.APP_URL}`,
          );
        }
        if (user.push_alerts) {
          await sendPushToUser(env, user.id, {
            title: 'Server Back Online',
            body: `Unraid was unreachable for ${duration} — now responding.`,
            url: '/',
            tag: 'server-availability',
          });
        }
      } else {
        // Normal heartbeat — just update last_online_at
        await env.DB.prepare(
          `UPDATE servers SET last_online_at = ? WHERE id = ?`
        ).bind(now, server.id).run();
      }
      return;
    }

    // Server is unreachable
    const firstFailure = server.offline_since ?? now;
    const updates: Promise<unknown>[] = [];

    if (server.offline_since === null) {
      // First failure — record offline_since
      updates.push(
        env.DB.prepare(`UPDATE servers SET offline_since = ? WHERE id = ?`)
          .bind(now, server.id).run()
      );
    }

    // Only alert once, after grace period
    if (!server.availability_alerted && (now - firstFailure) >= GRACE_SECONDS) {
      updates.push(
        env.DB.prepare(
          `UPDATE servers SET availability_alerted = 1 WHERE id = ?`
        ).bind(server.id).run()
      );

      updates.push(
        env.DB.prepare(
          `INSERT INTO monitor_events (user_id, monitor_type, monitor_id, monitor_name, detail, actions_taken)
           VALUES (?, 'server_availability', ?, 'Server Availability', ?, ?)`
        ).bind(
          user.id,
          server.id,
          JSON.stringify({ status: 'offline' }),
          JSON.stringify(['record']),
        ).run()
      );

      if (user.email_alerts) {
        updates.push(
          sendEmail(
            env,
            user.email,
            '[UnraidWatch] Server Unreachable',
            `Your Unraid server has been unreachable for over 5 minutes.\n\nURL: ${user.url}\n\nView your dashboard: ${env.APP_URL}`,
          )
        );
      }
      if (user.push_alerts) {
        updates.push(
          sendPushToUser(env, user.id, {
            title: 'Server Unreachable',
            body: `Unraid at ${user.url} has been offline for over 5 minutes.`,
            url: '/',
            tag: 'server-availability',
          })
        );
      }
    }

    await Promise.all(updates);
  } catch (err) {
    console.error(`Server availability check failed for user ${user.id}:`, err);
  }
}
