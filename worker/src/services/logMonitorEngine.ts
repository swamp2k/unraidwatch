import type { Env, LogMonitor, UserRow } from '../types';
import { decrypt } from './encryption';
import { getSyslog, getContainerLogs, containerAction } from './unraidClient';
import { sendEmail } from './emailService';
import { filterSyslogSinceCursor } from '../lib/syslogUtils';

export async function evaluateLogMonitors(user: UserRow, env: Env): Promise<void> {
  try {
    const apiKey = await decrypt(user.api_key, env);

    const monitors = await env.DB.prepare(
      'SELECT * FROM log_monitors WHERE user_id = ? AND enabled = 1'
    ).bind(user.id).all<LogMonitor>();

    if (monitors.results.length === 0) return;

    // Lazy-load log sources
    let syslogContent: string | null = null;
    const dockerLogsCache = new Map<string, string>();

    const now = Math.floor(Date.now() / 1000);
    const updates: D1PreparedStatement[] = [];

    for (const monitor of monitors.results) {
      let newLines: string[] = [];
      let newCursor = monitor.cursor;

      if (monitor.source_type === 'syslog') {
        if (syslogContent === null) {
          syslogContent = await getSyslog(user.url, apiKey, 10000);
        }
        const result = filterSyslogSinceCursor(syslogContent, monitor.cursor);
        newLines = result.lines;
        newCursor = result.newCursor;
      } else if (monitor.source_type === 'docker' && monitor.source_id) {
        if (!dockerLogsCache.has(monitor.source_id)) {
          const logs = await getContainerLogs(user.url, apiKey, monitor.source_id);
          dockerLogsCache.set(monitor.source_id, logs);
        }
        const allLines = (dockerLogsCache.get(monitor.source_id) ?? '').split('\n').filter(Boolean);
        const cursorCount = monitor.cursor !== null ? parseInt(monitor.cursor, 10) : 0;
        // If log was rotated (fewer lines than cursor), treat all as new
        newLines = allLines.length < cursorCount ? allLines : allLines.slice(cursorCount);
        newCursor = String(allLines.length);
      }

      // Always update cursor so we don't re-scan old lines
      updates.push(
        env.DB.prepare('UPDATE log_monitors SET cursor = ? WHERE id = ?')
          .bind(newCursor, monitor.id)
      );

      if (newLines.length === 0) continue;

      // Keyword matching
      const keywords: string[] = JSON.parse(monitor.keywords);
      const matches: { keyword: string; line: string }[] = [];
      for (const line of newLines) {
        const lc = line.toLowerCase();
        for (const kw of keywords) {
          if (lc.includes(kw.toLowerCase())) {
            matches.push({ keyword: kw, line });
            break;
          }
        }
      }

      if (matches.length === 0) continue;

      // Check cooldown
      const cooldownExpired = monitor.last_fired_at === null ||
        (now - monitor.last_fired_at) >= monitor.cooldown_s;

      if (!cooldownExpired) continue;

      const actionsTaken: string[] = [];
      const firstMatch = matches[0]!;

      if (monitor.notify_record) {
        actionsTaken.push('record');
        updates.push(
          env.DB.prepare(
            `INSERT INTO monitor_events (user_id, monitor_type, monitor_id, monitor_name, detail, actions_taken)
             VALUES (?, 'log', ?, ?, ?, ?)`
          ).bind(
            user.id,
            monitor.id,
            monitor.name,
            JSON.stringify({
              keyword: firstMatch.keyword,
              matched_line: firstMatch.line.slice(0, 500),
              source: monitor.source_type,
              source_label: monitor.source_label,
              total_matches: matches.length,
            }),
            JSON.stringify(actionsTaken),
          )
        );
      }

      if (monitor.notify_email && user.email_alerts) {
        actionsTaken.push('email');
        const sourceLabel = monitor.source_label ?? monitor.source_type;
        await sendEmail(
          env,
          user.email,
          `[UnraidWatch] Log Match: ${monitor.name}`,
          `Log monitor "${monitor.name}" triggered.\n\nSource: ${sourceLabel}\nKeyword: "${firstMatch.keyword}"\nMatched line:\n${firstMatch.line}\n\nTotal matches: ${matches.length}\n\nView your dashboard: ${env.APP_URL}`,
        );
      }

      if (monitor.notify_action && monitor.action_type && monitor.action_container_id) {
        try {
          await containerAction(user.url, apiKey, monitor.action_container_id, monitor.action_type);
          actionsTaken.push(monitor.action_type);
        } catch (err) {
          console.error(`Log monitor action failed for ${monitor.name}:`, err);
        }
      }

      updates.push(
        env.DB.prepare('UPDATE log_monitors SET last_fired_at = ? WHERE id = ?')
          .bind(now, monitor.id)
      );

      // Update actions_taken on the inserted event
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
    console.error(`Log monitor evaluation failed for user ${user.id}:`, err);
  }
}
