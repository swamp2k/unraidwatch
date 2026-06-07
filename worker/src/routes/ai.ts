import { Hono } from 'hono';
import type { Env, User, AIConfig } from '../types';
import { authMiddleware } from '../middleware/auth';
import { decrypt } from '../services/encryption';
import { analyzeLog } from '../services/aiClient';
import { getSyslog } from '../services/unraidClient';
import { filterSyslogByHours } from '../lib/syslogUtils';

const ai = new Hono<{ Bindings: Env; Variables: { user: User } }>();

ai.use('*', authMiddleware);

ai.post('/analyze', async (c) => {
  const user = c.get('user');
  const body = await c.req.json<{ source: string; log_text?: string; hours?: number; model_override?: string }>();

  let logText = body.log_text ?? '';
  let lineCount: number | undefined;

  // Auto-fetch mode: hours supplied, no manual log_text
  if (!logText && body.hours !== undefined) {
    const serverRow = await c.env.DB.prepare('SELECT url, api_key FROM servers WHERE user_id = ?')
      .bind(user.id).first<{ url: string; api_key: string }>();
    if (!serverRow) return c.json({ error: 'No server configured — add your server in Settings first.' }, 400);

    const apiKey = await decrypt(serverRow.api_key, c.env);

    if (body.source === 'syslog') {
      const raw = await getSyslog(serverRow.url, apiKey);
      logText = filterSyslogByHours(raw, body.hours);
      if (!logText.trim()) return c.json({ error: `No syslog entries found in the last ${body.hours}h.` }, 400);
      lineCount = logText.split('\n').filter(Boolean).length;
    }
  }

  if (!logText.trim()) return c.json({ error: 'No log text provided.' }, 400);

  const configRow = await c.env.DB.prepare('SELECT * FROM ai_configs WHERE user_id = ?').bind(user.id).first<AIConfig>();
  if (!configRow) return c.json({ error: 'No AI provider configured — add one in Settings.' }, 400);

  const decryptedKey = await decrypt(configRow.api_key, c.env);
  const config: AIConfig = { ...configRow, api_key: decryptedKey };

  const analysis = await analyzeLog(config, logText.slice(0, 8000), body.model_override);
  const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30;
  const sourceLabel = body.hours !== undefined ? `${body.source} (last ${body.hours}h)` : body.source;

  await c.env.DB.prepare(
    `INSERT INTO log_analyses (user_id, source, provider, model, log_excerpt, summary, severity, findings, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    user.id,
    sourceLabel,
    config.provider,
    body.model_override ?? config.default_model,
    logText.slice(0, 500),
    analysis.summary,
    analysis.severity,
    JSON.stringify(analysis.findings),
    expiresAt,
  ).run();

  const row = await c.env.DB.prepare('SELECT id, created_at FROM log_analyses WHERE user_id = ? ORDER BY created_at DESC LIMIT 1')
    .bind(user.id).first<{ id: string; created_at: number }>();

  return c.json({
    id: row?.id,
    severity: analysis.severity,
    summary: analysis.summary,
    findings: analysis.findings,
    model: body.model_override ?? config.default_model,
    provider: config.provider,
    source: sourceLabel,
    line_count: lineCount,
    created_at: row?.created_at,
  });
});

ai.get('/history', async (c) => {
  const user = c.get('user');
  const rows = await c.env.DB.prepare(
    'SELECT id, source, provider, model, severity, summary, log_excerpt, created_at FROM log_analyses WHERE user_id = ? AND expires_at > unixepoch() ORDER BY created_at DESC LIMIT 50'
  ).bind(user.id).all();
  return c.json(rows.results);
});

ai.get('/history/:id', async (c) => {
  const user = c.get('user');
  const row = await c.env.DB.prepare(
    'SELECT * FROM log_analyses WHERE id = ? AND user_id = ?'
  ).bind(c.req.param('id'), user.id).first<{ findings: string }>();
  if (!row) return c.json({ error: 'Not found' }, 404);
  return c.json({ ...row, findings: JSON.parse(row.findings) });
});

ai.delete('/history/:id', async (c) => {
  const user = c.get('user');
  await c.env.DB.prepare('DELETE FROM log_analyses WHERE id = ? AND user_id = ?').bind(c.req.param('id'), user.id).run();
  return c.json({ ok: true });
});

export default ai;
