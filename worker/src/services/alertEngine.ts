import type { Env, AlertRule, UserRow } from '../types';
import { decrypt } from './encryption';
import { getStats, getContainers, getUPS } from './unraidClient';
import { sendAlertEmail } from './emailService';

function evaluate(rule: AlertRule, value: number | string): boolean {
  const numVal = typeof value === 'number' ? value : parseFloat(value as string);
  const threshold = parseFloat(rule.threshold);
  switch (rule.operator) {
    case 'gt': return numVal > threshold;
    case 'lt': return numVal < threshold;
    case 'eq': return String(value) === rule.threshold;
    case 'contains': return String(value).includes(rule.threshold);
    default: return false;
  }
}

export async function evaluateAlerts(user: UserRow, env: Env): Promise<void> {
  const apiKey = await decrypt(user.api_key, env);
  const [stats, containers, ups] = await Promise.allSettled([
    getStats(user.url, apiKey),
    getContainers(user.url, apiKey),
    getUPS(user.url, apiKey),
  ]);

  const metrics: Record<string, number | string> = {};
  if (stats.status === 'fulfilled') {
    metrics['cpu_pct'] = stats.value.cpu_pct;
    metrics['ram_pct'] = stats.value.ram_pct;
    metrics['temp_avg'] = stats.value.temp_avg;
  }
  if (ups.status === 'fulfilled' && ups.value !== null) {
    metrics['ups_battery_pct'] = ups.value.battery_pct;
  }
  if (containers.status === 'fulfilled') {
    for (const c of containers.value) {
      if (c.status !== 'running') metrics[`container_stopped_${c.name}`] = c.name;
    }
  }

  const rules = await env.DB.prepare(
    'SELECT * FROM alert_rules WHERE user_id = ? AND enabled = 1'
  ).bind(user.id).all<AlertRule>();

  for (const rule of rules.results) {
    const value = metrics[rule.metric] ?? metrics[Object.keys(metrics).find(k => k.startsWith(rule.metric)) ?? ''];
    if (value === undefined) continue;
    if (!evaluate(rule, value)) continue;

    const severity = rule.metric.includes('critical') ? 'critical' : 'warning';
    if (user.alert_min_severity === 'critical' && severity !== 'critical') continue;

    await env.DB.prepare(
      `INSERT INTO alert_history (user_id, rule_id, rule_name, metric, value, severity) VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(user.id, rule.id, rule.name, rule.metric, String(value), severity).run();

    if (user.email_alerts) {
      await sendAlertEmail(env, user.email, rule.name, rule.metric, String(value), severity);
    }
  }
}
