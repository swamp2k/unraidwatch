import { Hono } from 'hono';
import type { Env, User, AIConfig } from '../types';
import { authMiddleware } from '../middleware/auth';
import { decrypt } from '../services/encryption';
import {
  getStats, getContainers, getArray, getShares, getSyslog, getContainerLogs,
} from '../services/unraidClient';
import { filterSyslogByHours } from './ai';

export interface DetectiveResult {
  severity: 'ok' | 'warning' | 'critical';
  summary: string;
  root_cause: string;
  evidence: string[];
  findings: Array<{ issue: string; cause: string; fix: string }>;
  data_collected: string[];
}

// ── Tool definitions ────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'collect_syslog',
    description: 'Collect system log entries. Use for kernel errors, service failures, hardware issues, network problems.',
    input_schema: {
      type: 'object',
      properties: {
        hours: { type: 'number', description: 'Hours of history to collect (1–48)', minimum: 1, maximum: 48 },
      },
      required: ['hours'],
    },
  },
  {
    name: 'get_container_logs',
    description: 'Get recent logs from a Docker container. Use when the problem involves a specific service.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Container name exactly as listed in inventory (without leading /)' },
      },
      required: ['name'],
    },
  },
  {
    name: 'get_system_stats',
    description: 'Get current CPU %, RAM %, average temperature, and uptime.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_array_status',
    description: 'Get array state, individual disk health, temperatures, and capacity.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_shares',
    description: 'Get share names and disk usage. Use when the problem may involve storage space.',
    input_schema: { type: 'object', properties: {} },
  },
] as const;

const SYSTEM_PROMPT = `You are an expert Unraid system administrator performing root-cause analysis.
The user has described a problem. Investigate it systematically using the available tools.

Rules:
- Use only the tools needed for this specific problem — do not collect everything blindly.
- For container-related issues, always check both syslog and the specific container's logs.
- For performance issues, always check system stats.
- For storage issues, always check array status and shares.
- Collect 1–4 hours of syslog unless the problem is intermittent (then use more).
- You may make multiple rounds of tool calls if initial data points to something needing deeper inspection.

After collecting enough data, respond ONLY with a valid JSON object in this exact shape:
{
  "severity": "ok" | "warning" | "critical",
  "summary": "<2–3 sentence plain English summary>",
  "root_cause": "<The most likely single root cause>",
  "evidence": ["<key log line or stat that points to the issue>", ...],
  "findings": [{ "issue": "<name>", "cause": "<explanation>", "fix": "<concrete numbered steps>" }],
  "data_collected": ["<what was fetched, e.g. syslog (2h)>", ...]
}

If you cannot identify a clear cause, say so honestly in root_cause.`;

// ── Claude tool-use orchestration ───────────────────────────────────────────

type ClaudeContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown };

interface ClaudeResponse {
  content: ClaudeContentBlock[];
  stop_reason: string;
}

async function callClaude(
  apiKey: string,
  model: string,
  messages: Array<{ role: string; content: unknown }>,
  withTools = true,
): Promise<ClaudeResponse> {
  const body: Record<string, unknown> = {
    model,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages,
  };
  if (withTools) body['tools'] = TOOLS;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Claude API error: ${res.status} ${await res.text()}`);
  return res.json() as Promise<ClaudeResponse>;
}

// ── Tool executor ────────────────────────────────────────────────────────────

async function executeTool(
  name: string,
  input: unknown,
  serverUrl: string,
  apiKey: string,
  containerMap: Map<string, string>, // name → full id
): Promise<string> {
  const inp = input as Record<string, unknown>;

  switch (name) {
    case 'collect_syslog': {
      const hours = Math.min(48, Math.max(1, Number(inp.hours ?? 2)));
      const raw = await getSyslog(serverUrl, apiKey);
      const filtered = filterSyslogByHours(raw, hours);
      return filtered.slice(0, 6000) || `No syslog entries found for the last ${hours}h.`;
    }
    case 'get_container_logs': {
      const requestedName = String(inp.name ?? '');
      // fuzzy-match container name (case-insensitive, partial)
      const fullId = [...containerMap.entries()].find(
        ([n]) => n.toLowerCase().includes(requestedName.toLowerCase()),
      )?.[1];
      if (!fullId) return `Container "${requestedName}" not found. Available: ${[...containerMap.keys()].join(', ')}`;
      const logs = await getContainerLogs(serverUrl, apiKey, fullId);
      return logs.slice(-4000) || '(no logs)';
    }
    case 'get_system_stats': {
      const s = await getStats(serverUrl, apiKey);
      return JSON.stringify({
        cpu_percent: s.cpu_pct,
        ram_used_gb: s.ram_used_gb,
        ram_total_gb: s.ram_total_gb,
        ram_used_percent: s.ram_pct,
        temp_avg_celsius: s.temp_avg,
        uptime_hours: Math.round(s.uptime_s / 3600),
      }, null, 2);
    }
    case 'get_array_status': {
      const a = await getArray(serverUrl, apiKey);
      return JSON.stringify(a, null, 2);
    }
    case 'get_shares': {
      const sh = await getShares(serverUrl, apiKey);
      return JSON.stringify(sh, null, 2);
    }
    default:
      return `Unknown tool: ${name}`;
  }
}

// ── Route ────────────────────────────────────────────────────────────────────

const detective = new Hono<{ Bindings: Env; Variables: { user: User } }>();

detective.use('*', authMiddleware);

detective.post('/investigate', async (c) => {
  const user = c.get('user');
  const { problem } = await c.req.json<{ problem: string }>();
  if (!problem?.trim()) return c.json({ error: 'Describe the problem.' }, 400);

  const [serverRow, configRow] = await Promise.all([
    c.env.DB.prepare('SELECT url, api_key FROM servers WHERE user_id = ?').bind(user.id).first<{ url: string; api_key: string }>(),
    c.env.DB.prepare('SELECT * FROM ai_configs WHERE user_id = ?').bind(user.id).first<AIConfig>(),
  ]);

  if (!serverRow) return c.json({ error: 'No server configured — add one in Settings first.' }, 400);
  if (!configRow) return c.json({ error: 'No AI provider configured — add one in Settings first.' }, 400);
  if (configRow.provider !== 'claude') return c.json({ error: 'AI Detective currently requires Claude. Switch your AI provider in Settings.' }, 400);

  const [serverApiKey, aiApiKey] = await Promise.all([
    decrypt(serverRow.api_key, c.env),
    decrypt(configRow.api_key, c.env),
  ]);

  // Collect system inventory to give Claude context before it decides what to fetch
  const [containers, stats, array] = await Promise.allSettled([
    getContainers(serverRow.url, serverApiKey),
    getStats(serverRow.url, serverApiKey),
    getArray(serverRow.url, serverApiKey),
  ]);

  const containerList = containers.status === 'fulfilled' ? containers.value : [];
  const containerMap = new Map(containerList.map(c => [c.name, c.id]));

  const runningContainers = containerList.filter(c => c.status === 'running').map(c => c.name);
  const stoppedContainers = containerList.filter(c => c.status !== 'running').map(c => c.name);

  const inventory = [
    `Running containers (${runningContainers.length}): ${runningContainers.join(', ') || 'none'}`,
    stoppedContainers.length ? `Stopped containers: ${stoppedContainers.join(', ')}` : '',
    stats.status === 'fulfilled'
      ? `System: CPU ${stats.value.cpu_pct}%, RAM ${stats.value.ram_pct}%, temp ${stats.value.temp_avg}°C, uptime ${Math.round(stats.value.uptime_s / 3600)}h`
      : '',
    array.status === 'fulfilled'
      ? `Array: ${array.value.status}, ${array.value.capacity_used_tb}/${array.value.capacity_total_tb} TB used, ${array.value.disks.length} disks`
      : '',
  ].filter(Boolean).join('\n');

  // ── Multi-turn tool-use loop ────────────────────────────────────────────────

  const messages: Array<{ role: string; content: unknown }> = [
    { role: 'user', content: `Problem: "${problem}"\n\nSystem inventory:\n${inventory}` },
  ];

  const MAX_ROUNDS = 3;
  let response = await callClaude(aiApiKey, configRow.default_model, messages);

  for (let round = 0; round < MAX_ROUNDS && response.stop_reason === 'tool_use'; round++) {
    const toolCalls = response.content.filter((b): b is Extract<ClaudeContentBlock, { type: 'tool_use' }> => b.type === 'tool_use');

    const toolResults = await Promise.all(
      toolCalls.map(async (call) => ({
        type: 'tool_result' as const,
        tool_use_id: call.id,
        content: await executeTool(call.name, call.input, serverRow.url, serverApiKey, containerMap)
          .catch((e: unknown) => `Error: ${e instanceof Error ? e.message : String(e)}`),
      })),
    );

    messages.push({ role: 'assistant', content: response.content });
    messages.push({ role: 'user', content: toolResults });
    response = await callClaude(aiApiKey, configRow.default_model, messages);
  }

  // ── Dedicated JSON extraction call with prefill ──────────────────────────
  // After the tool loop, Claude may have responded with natural language.
  // We do one final dedicated call WITHOUT tools, prefilling the assistant
  // response with '{' — this forces Claude to output valid JSON directly.

  // If the loop exited mid-tool-use (hit MAX_ROUNDS), satisfy pending tool calls
  if (response.stop_reason === 'tool_use') {
    const pending = response.content.filter((b): b is Extract<ClaudeContentBlock, { type: 'tool_use' }> => b.type === 'tool_use');
    messages.push({ role: 'assistant', content: response.content });
    messages.push({
      role: 'user',
      content: pending.map(b => ({ type: 'tool_result', tool_use_id: b.id, content: 'No more data available. Proceed with analysis.' })),
    });
  } else {
    // Normal end — include Claude's last message in context
    messages.push({ role: 'assistant', content: response.content });
  }

  // Prefill: end with partial assistant message starting with '{'
  messages.push({ role: 'user', content: 'Output your complete analysis now as a JSON object.' });
  messages.push({ role: 'assistant', content: '{' });

  const jsonResponse = await callClaude(aiApiKey, configRow.default_model, messages, false);
  const jsonText = '{' + (jsonResponse.content.find((b): b is Extract<ClaudeContentBlock, { type: 'text' }> => b.type === 'text')?.text ?? '');

  let result: DetectiveResult;
  try {
    // Find the outermost JSON object in case there's any trailing text
    const start = jsonText.indexOf('{');
    const end = jsonText.lastIndexOf('}');
    const clean = start !== -1 && end !== -1 ? jsonText.slice(start, end + 1) : jsonText;
    result = JSON.parse(clean) as DetectiveResult;
  } catch {
    return c.json({ error: 'AI response was not valid JSON. Try rephrasing the problem.' }, 500);
  }

  // Save to D1
  const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30;
  await c.env.DB.prepare(
    `INSERT INTO detective_investigations
       (user_id, problem, provider, model, severity, summary, root_cause, evidence, findings, data_collected, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    user.id,
    problem,
    configRow.provider,
    configRow.default_model,
    result.severity,
    result.summary,
    result.root_cause,
    JSON.stringify(result.evidence ?? []),
    JSON.stringify(result.findings ?? []),
    JSON.stringify(result.data_collected ?? []),
    expiresAt,
  ).run();

  const saved = await c.env.DB.prepare(
    'SELECT id, created_at FROM detective_investigations WHERE user_id = ? ORDER BY created_at DESC LIMIT 1'
  ).bind(user.id).first<{ id: string; created_at: number }>();

  return c.json({ ...result, id: saved?.id, created_at: saved?.created_at, problem });
});

detective.post('/chat', async (c) => {
  const user = c.get('user');
  const { finding, messages, investigation_context } = await c.req.json<{
    finding: { issue: string; cause: string; fix: string };
    messages: Array<{ role: string; content: string }>;
    investigation_context?: string;
  }>();

  if (!messages?.length) return c.json({ error: 'Messages required.' }, 400);

  const configRow = await c.env.DB.prepare('SELECT * FROM ai_configs WHERE user_id = ?')
    .bind(user.id).first<AIConfig>();

  if (!configRow) return c.json({ error: 'No AI provider configured — add one in Settings.' }, 400);
  if (configRow.provider !== 'claude') return c.json({ error: 'AI Detective requires Claude. Switch your AI provider in Settings.' }, 400);

  const aiApiKey = await decrypt(configRow.api_key, c.env);

  const systemPrompt = [
    'You are an expert Unraid system administrator helping the user resolve a specific issue.',
    'Be concise and practical. Format responses clearly with numbered steps where appropriate.',
    `\nIssue being addressed: ${finding.issue}`,
    `Root cause: ${finding.cause}`,
    investigation_context ? `\nOriginal investigation context:\n${investigation_context}` : '',
  ].filter(Boolean).join('\n');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': aiApiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: configRow.default_model,
      max_tokens: 1024,
      system: systemPrompt,
      messages,
    }),
  });

  if (!res.ok) throw new Error(`Claude API error: ${res.status} ${await res.text()}`);
  const data = await res.json() as { content: Array<{ type: string; text: string }> };
  const answer = data.content.find(b => b.type === 'text')?.text ?? '';

  return c.json({ answer });
});

detective.get('/history', async (c) => {
  const user = c.get('user');
  const rows = await c.env.DB.prepare(
    'SELECT id, problem, severity, summary, data_collected, created_at FROM detective_investigations WHERE user_id = ? AND expires_at > unixepoch() ORDER BY created_at DESC LIMIT 50'
  ).bind(user.id).all<{ data_collected: string }>();
  return c.json(rows.results.map(r => ({ ...r, data_collected: JSON.parse(r.data_collected) })));
});

detective.get('/history/:id', async (c) => {
  const user = c.get('user');
  const row = await c.env.DB.prepare(
    'SELECT * FROM detective_investigations WHERE id = ? AND user_id = ?'
  ).bind(c.req.param('id'), user.id).first<{ evidence: string; findings: string; data_collected: string }>();
  if (!row) return c.json({ error: 'Not found' }, 404);
  return c.json({
    ...row,
    evidence: JSON.parse(row.evidence),
    findings: JSON.parse(row.findings),
    data_collected: JSON.parse(row.data_collected),
  });
});

detective.delete('/history/:id', async (c) => {
  const user = c.get('user');
  await c.env.DB.prepare('DELETE FROM detective_investigations WHERE id = ? AND user_id = ?')
    .bind(c.req.param('id'), user.id).run();
  return c.json({ ok: true });
});

export default detective;
