import { Hono } from 'hono';
import { WorkerEntrypoint } from 'cloudflare:workers';
import type { Env } from './types';
import * as nexusIntegration from './integration/nexusIntegration';
import type {
  IntegrationIdentityDto, NexusUnraidIntegration, UnraidArrayDto, UnraidContainerDto,
  UnraidOverviewDto, UnraidShareDto, UnraidStatsDto, UnraidUpsDto, UnraidVmDto,
} from './integration/contract';
import { corsMiddleware } from './middleware/cors';
import authRoutes from './routes/auth';
import adminRoutes from './routes/admin';
import serverRoutes from './routes/server';
import aiConfigRoutes from './routes/aiConfig';
import unraidRoutes from './routes/unraid';
import sseRoutes from './routes/sse';
import aiRoutes from './routes/ai';
import alertRoutes from './routes/alerts';
import pushRoutes from './routes/push';
import detectiveRoutes from './routes/detective';
import { evaluateAlerts } from './services/alertEngine';
import { evaluateDockerMonitors } from './services/dockerMonitorEngine';
import { evaluateLogMonitors } from './services/logMonitorEngine';
import { collectMetrics } from './services/metricsCollector';
import { checkServerAvailability } from './services/serverAvailabilityEngine';
import monitorRoutes from './routes/monitors';
import metricsRoutes from './routes/metrics';
import settingsRoutes from './routes/settings';
import integrationRoutes from './routes/integrations';

const app = new Hono<{ Bindings: Env }>();

app.onError((err, c) => {
  const origin = c.req.header('Origin') ?? '';
  const allowed = c.env?.APP_URL ?? '';
  const res = c.json({ error: 'Internal server error' }, 500);
  res.headers.set('Access-Control-Allow-Origin', origin === allowed ? origin : allowed);
  res.headers.set('Access-Control-Allow-Credentials', 'true');
  return res;
});

app.use('*', corsMiddleware);

app.route('/api/auth', authRoutes);
app.route('/api/admin', adminRoutes);
app.route('/api/server', serverRoutes);
app.route('/api/ai-config', aiConfigRoutes);
app.route('/api/unraid', unraidRoutes);
app.route('/api/sse', sseRoutes);
app.route('/api/ai', aiRoutes);
app.route('/api/alerts', alertRoutes);
app.route('/api/push', pushRoutes);
app.route('/api/detective', detectiveRoutes);
app.route('/api/monitors', monitorRoutes);
app.route('/api/metrics', metricsRoutes);
app.route('/api/settings', settingsRoutes);
app.route('/api/integrations', integrationRoutes);

app.get('/api/health', (c) => c.json({ ok: true }));

/**
 * Cloudflare transport adapter for the Nexus integration contract.
 *
 * This class is deliberately nothing but delegation. All behaviour lives in
 * `integration/nexusIntegration.ts`, which knows nothing about Cloudflare RPC —
 * so putting an HTTP controller in front of the same functions later requires
 * no change to the contract, the DTOs, or any consumer's rendering code.
 *
 * Consumers bind to this with:
 *   services = [{ binding = "...", service = "unraidwatch-api", entrypoint = "NexusIntegration" }]
 */
export class NexusIntegration extends WorkerEntrypoint<Env> implements NexusUnraidIntegration {
  identify(token: string): Promise<IntegrationIdentityDto> {
    return nexusIntegration.identify(this.env, token);
  }
  getOverview(token: string): Promise<UnraidOverviewDto> {
    return nexusIntegration.getOverview(this.env, token);
  }
  getStats(token: string): Promise<UnraidStatsDto> {
    return nexusIntegration.getStats(this.env, token);
  }
  getArray(token: string): Promise<UnraidArrayDto> {
    return nexusIntegration.getArray(this.env, token);
  }
  getDocker(token: string): Promise<UnraidContainerDto[]> {
    return nexusIntegration.getDocker(this.env, token);
  }
  getVMs(token: string): Promise<UnraidVmDto[]> {
    return nexusIntegration.getVMs(this.env, token);
  }
  getShares(token: string): Promise<UnraidShareDto[]> {
    return nexusIntegration.getShares(this.env, token);
  }
  getUPS(token: string): Promise<UnraidUpsDto | null> {
    return nexusIntegration.getUPS(this.env, token);
  }
}

export default {
  fetch: app.fetch,

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    const usersQuery = env.DB.prepare(
      `SELECT u.id, u.email, s.url, s.api_key,
              COALESCE(n.email_alerts, 1) as email_alerts,
              COALESCE(n.push_alerts, 0) as push_alerts,
              COALESCE(n.alert_min_severity, 'warning') as alert_min_severity
       FROM users u
       JOIN servers s ON s.user_id = u.id
       LEFT JOIN notification_prefs n ON n.user_id = u.id`
    );

    // Per-minute: run docker + log monitors (each monitor decides internally if it's due)
    if (event.cron === '* * * * *') {
      const users = await usersQuery.all<{ id: string; email: string; url: string; api_key: string; email_alerts: number; push_alerts: number; alert_min_severity: string }>();
      for (const user of users.results) {
        ctx.waitUntil(evaluateDockerMonitors(user, env));
        ctx.waitUntil(evaluateLogMonitors(user, env));
        ctx.waitUntil(collectMetrics(user, env));
        ctx.waitUntil(checkServerAvailability(user, env));
      }
      return;
    }

    // Hourly: run metric-based alert rules
    if (event.cron === '0 * * * *') {
      const users = await usersQuery.all<{ id: string; email: string; url: string; api_key: string; email_alerts: number; push_alerts: number; alert_min_severity: string }>();
      for (const user of users.results) {
        ctx.waitUntil(evaluateAlerts(user, env));
      }
      return;
    }

    // Daily briefing
    if (event.cron === '0 7 * * *') {
      const hour = new Date().getUTCHours();
      const briefingUsers = await env.DB.prepare(
        `SELECT bs.user_id, u.email, bs.deliver_via
         FROM briefing_schedules bs
         JOIN users u ON u.id = bs.user_id
         WHERE bs.enabled = 1 AND bs.hour_utc = ?`
      ).bind(hour).all<{ user_id: string; email: string; deliver_via: string }>();

      for (const u of briefingUsers.results) {
        console.log(`Daily briefing scheduled for ${u.email}`);
      }
    }
  },
};
