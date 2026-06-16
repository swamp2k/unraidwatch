import type { Env, DockerMonitor, UserRow } from '../types';
import { decrypt } from './encryption';
import { getContainers, containerAction } from './unraidClient';
import { sendEmail } from './emailService';
import { sendPushToUser } from './webPush';

export async function evaluateDockerMonitors(user: UserRow, env: Env): Promise<void> {
  try {
    const apiKey = await decrypt(user.api_key, env);
    const containersResult = await getContainers(user.url, apiKey);
    const statusMap = new Map<string, string>(containersResult.map(c => [c.id, c.status]));

    const monitors = await env.DB.prepare(
      'SELECT * FROM docker_monitors WHERE user_id = ? AND enabled = 1'
    ).bind(user.id).all<DockerMonitor>();

    const now = Math.floor(Date.now() / 1000);
    const updates: D1PreparedStatement[] = [];

    for (const monitor of monitors.results) {
      // Skip if not due for a check yet
      const isDue = monitor.last_checked_at === null ||
        (now - monitor.last_checked_at) >= monitor.check_interval_s;
      if (!isDue) continue;

      // Mark as checked regardless of outcome
      updates.push(
        env.DB.prepare('UPDATE docker_monitors SET last_checked_at = ? WHERE id = ?')
          .bind(now, monitor.id)
      );

      const currentStatus = statusMap.get(monitor.container_id) ?? 'not_found';

      if (currentStatus === 'running') {
        // Container recovered — reset cooldown so next outage fires immediately
        if (monitor.last_status !== 'running') {
          updates.push(
            env.DB.prepare('UPDATE docker_monitors SET last_status = ?, last_fired_at = NULL WHERE id = ?')
              .bind('running', monitor.id)
          );
        }
        continue;
      }

      // Check cooldown
      const cooldownExpired = monitor.last_fired_at === null ||
        (now - monitor.last_fired_at) >= monitor.cooldown_s;

      // Always update last_status
      updates.push(
        env.DB.prepare('UPDATE docker_monitors SET last_status = ? WHERE id = ?')
          .bind(currentStatus, monitor.id)
      );

      if (!cooldownExpired) continue;

      const actionsTaken: string[] = [];

      if (monitor.notify_record) {
        actionsTaken.push('record');
        updates.push(
          env.DB.prepare(
            `INSERT INTO monitor_events (user_id, monitor_type, monitor_id, monitor_name, detail, actions_taken)
             VALUES (?, 'docker', ?, ?, ?, ?)`
          ).bind(
            user.id,
            monitor.id,
            monitor.container_name,
            JSON.stringify({ status: currentStatus, container_name: monitor.container_name }),
            JSON.stringify(actionsTaken),
          )
        );
      }

      if (monitor.notify_email && user.email_alerts) {
        actionsTaken.push('email');
        await sendEmail(
          env,
          user.email,
          `[UnraidWatch] Container Down: ${monitor.container_name}`,
          `Container "${monitor.container_name}" is ${currentStatus}.\n\nConfigured action: ${monitor.action_type ?? 'none'}\n\nView your dashboard: ${env.APP_URL}`,
        );
      }

      if (monitor.notify_email && user.push_alerts) {
        actionsTaken.push('push');
        await sendPushToUser(env, user.id, {
          title: `🔴 Container Down: ${monitor.container_name}`,
          body: `Status: ${currentStatus}${monitor.action_type ? ` — running ${monitor.action_type}` : ''}`,
          url: '/monitors/docker',
          tag: `docker-${monitor.id}`,
        });
      }

      if (monitor.notify_action && monitor.action_type) {
        try {
          await containerAction(user.url, apiKey, monitor.container_id, monitor.action_type);
          actionsTaken.push(monitor.action_type);
        } catch (err) {
          console.error(`Docker monitor action failed for ${monitor.container_name}:`, err);
        }
      }

      // Update fired timestamp
      updates.push(
        env.DB.prepare('UPDATE docker_monitors SET last_fired_at = ? WHERE id = ?')
          .bind(now, monitor.id)
      );

      // Update actions_taken on the event we just inserted (update the last insert)
      if (monitor.notify_record) {
        updates.push(
          env.DB.prepare(
            `UPDATE monitor_events SET actions_taken = ? WHERE monitor_id = ? AND user_id = ? ORDER BY fired_at DESC LIMIT 1`
          ).bind(JSON.stringify(actionsTaken), monitor.id, user.id)
        );
      }
    }

    if (updates.length > 0) {
      await env.DB.batch(updates);
    }
  } catch (err) {
    console.error(`Docker monitor evaluation failed for user ${user.id}:`, err);
  }
}
