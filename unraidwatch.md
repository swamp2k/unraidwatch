# UnraidWatch — Claude Code Handover Document

> Full specification for a multi-user Unraid monitoring web app with AI log analysis.
> Built on Cloudflare Pages + Workers + D1. Ready to scaffold.

---

## 1. Project Summary

**UnraidWatch** is a self-hostable web dashboard for monitoring Unraid 7.2+ servers. It connects to the Unraid built-in API, displays live system stats, manages Docker containers, VMs, shares, and UPS, and provides AI-powered log analysis using the user's choice of Claude, Gemini, or OpenAI.

It is multi-user, invite-only, with each user storing their own Unraid connection config and AI provider config.

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React (Vite), hosted on Cloudflare Pages |
| Backend API | Cloudflare Worker (Hono framework recommended) |
| Database | Cloudflare D1 (SQLite) |
| Sessions | Cloudflare KV |
| Real-time | Server-Sent Events (SSE) via Worker |
| Email | Purelymail SMTP (magic links + alert emails) |
| Web Push | Web Push API (VAPID keys stored in Worker secrets) |
| AI Providers | Anthropic Claude, Google Gemini, OpenAI — user-configured |
| Deployment | GitHub Actions + Wrangler |
| Runtime/Node | mise |
| Repo structure | Monorepo: `/frontend`, `/worker`, `/migrations` |

---

## 3. Repository Structure

```
unraidwatch/
├── frontend/               # React SPA (Vite)
│   ├── src/
│   │   ├── components/
│   │   │   ├── layout/     # Sidebar, TopBar, ThemeToggle
│   │   │   ├── dashboard/  # StatCard, CpuChart, MemChart, ArrayStatus
│   │   │   ├── docker/     # ContainerList, ContainerCard, LogViewer
│   │   │   ├── vms/        # VMList, VMCard
│   │   │   ├── shares/     # ShareList, ShareCard
│   │   │   ├── ups/        # UPSCard
│   │   │   ├── ai/         # LogAnalyzer, AnalysisHistory, ChatPane
│   │   │   ├── alerts/     # AlertRules, AlertHistory
│   │   │   └── settings/   # ServerConfig, AIConfig, Profile, Theme
│   │   ├── pages/
│   │   │   ├── Login.jsx
│   │   │   ├── AcceptInvite.jsx
│   │   │   ├── Dashboard.jsx
│   │   │   ├── Docker.jsx
│   │   │   ├── VMs.jsx
│   │   │   ├── Shares.jsx
│   │   │   ├── UPS.jsx
│   │   │   ├── AIAnalysis.jsx
│   │   │   ├── Alerts.jsx
│   │   │   └── Settings.jsx
│   │   ├── hooks/
│   │   │   ├── useSSE.js       # SSE connection + reconnect logic
│   │   │   ├── useUnraid.js    # Unraid API data hooks
│   │   │   └── useAuth.js      # Auth state + session
│   │   ├── lib/
│   │   │   ├── api.js          # Typed fetch wrapper for Worker API
│   │   │   └── format.js       # Bytes, uptime, temp formatting utils
│   │   └── main.jsx
│   ├── public/
│   │   └── icons/              # PWA icons, favicon
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
│
├── worker/                 # Cloudflare Worker (Hono)
│   ├── src/
│   │   ├── index.ts            # Entry point, route registration
│   │   ├── middleware/
│   │   │   ├── auth.ts         # Session validation middleware
│   │   │   └── cors.ts
│   │   ├── routes/
│   │   │   ├── auth.ts         # /api/auth/*
│   │   │   ├── unraid.ts       # /api/unraid/* (proxy)
│   │   │   ├── ai.ts           # /api/ai/*
│   │   │   ├── alerts.ts       # /api/alerts/*
│   │   │   ├── sse.ts          # /api/sse (event stream)
│   │   │   └── admin.ts        # /api/admin/* (invite management)
│   │   ├── services/
│   │   │   ├── unraidClient.ts # Unraid API wrapper
│   │   │   ├── aiClient.ts     # Multi-provider AI abstraction
│   │   │   ├── emailService.ts # Purelymail SMTP
│   │   │   ├── pushService.ts  # Web Push / VAPID
│   │   │   └── alertEngine.ts  # Alert rule evaluation
│   │   └── types.ts            # Shared TypeScript types
│   ├── wrangler.toml
│   └── package.json
│
├── migrations/             # D1 SQL migration files
│   ├── 0001_initial.sql
│   ├── 0002_alerts.sql
│   └── 0003_push_subscriptions.sql
│
├── .github/
│   └── workflows/
│       ├── deploy-frontend.yml
│       └── deploy-worker.yml
│
└── README.md
```

---

## 4. D1 Database Schema

### migrations/0001_initial.sql

```sql
-- Users
CREATE TABLE users (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  email       TEXT UNIQUE NOT NULL,
  password_hash TEXT,                    -- NULL if magic-link only
  role        TEXT NOT NULL DEFAULT 'user', -- 'admin' | 'user'
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  last_login  INTEGER
);

-- Invites
CREATE TABLE invites (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  email       TEXT NOT NULL,
  token       TEXT UNIQUE NOT NULL,
  created_by  TEXT NOT NULL REFERENCES users(id),
  used_at     INTEGER,
  expires_at  INTEGER NOT NULL
);

-- Per-user Unraid server config
CREATE TABLE servers (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id     TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  label       TEXT NOT NULL DEFAULT 'My Tower',
  url         TEXT NOT NULL,             -- e.g. https://tower.local or tunnel URL
  api_key     TEXT NOT NULL,             -- encrypted at rest (Worker encrypts before insert)
  verified_at INTEGER,                   -- NULL = not yet tested
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Per-user AI provider config
CREATE TABLE ai_configs (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id     TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  provider    TEXT NOT NULL DEFAULT 'claude', -- 'claude' | 'gemini' | 'openai'
  api_key     TEXT NOT NULL,             -- encrypted at rest
  default_model TEXT NOT NULL,          -- e.g. 'claude-haiku-4-5', 'gpt-4o-mini', 'gemini-1.5-flash'
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

-- AI log analysis history
CREATE TABLE log_analyses (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source      TEXT NOT NULL,            -- 'syslog' | 'docker:{name}' | 'manual'
  trigger     TEXT NOT NULL DEFAULT 'manual', -- 'manual' | 'scheduled'
  provider    TEXT NOT NULL,
  model       TEXT NOT NULL,
  log_excerpt TEXT NOT NULL,            -- first 500 chars of submitted log
  summary     TEXT NOT NULL,
  severity    TEXT NOT NULL,            -- 'ok' | 'warning' | 'critical'
  findings    TEXT NOT NULL,            -- JSON array of {issue, cause, fix}
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  expires_at  INTEGER NOT NULL          -- created_at + 30 days
);
CREATE INDEX idx_log_analyses_user ON log_analyses(user_id, created_at DESC);

-- Daily briefing schedule
CREATE TABLE briefing_schedules (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id     TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  enabled     INTEGER NOT NULL DEFAULT 0,
  hour_utc    INTEGER NOT NULL DEFAULT 7, -- 0-23
  deliver_via TEXT NOT NULL DEFAULT 'email' -- 'email' | 'push' | 'both'
);

-- User notification preferences
CREATE TABLE notification_prefs (
  user_id         TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  email_alerts    INTEGER NOT NULL DEFAULT 1,
  push_alerts     INTEGER NOT NULL DEFAULT 0,
  alert_min_severity TEXT NOT NULL DEFAULT 'warning' -- 'warning' | 'critical'
);
```

### migrations/0002_alerts.sql

```sql
CREATE TABLE alert_rules (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  metric      TEXT NOT NULL,  -- 'cpu_pct' | 'ram_pct' | 'disk_temp' | 'array_error' | 'container_stopped' | 'ups_battery_pct'
  operator    TEXT NOT NULL,  -- 'gt' | 'lt' | 'eq' | 'contains'
  threshold   TEXT NOT NULL,  -- numeric or string depending on metric
  enabled     INTEGER NOT NULL DEFAULT 1,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE alert_history (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rule_id     TEXT REFERENCES alert_rules(id) ON DELETE SET NULL,
  rule_name   TEXT NOT NULL,
  metric      TEXT NOT NULL,
  value       TEXT NOT NULL,
  severity    TEXT NOT NULL,
  delivered_via TEXT,          -- 'email' | 'push' | 'both' | NULL
  fired_at    INTEGER NOT NULL DEFAULT (unixepoch()),
  resolved_at INTEGER
);
CREATE INDEX idx_alert_history_user ON alert_history(user_id, fired_at DESC);
```

### migrations/0003_push_subscriptions.sql

```sql
CREATE TABLE push_subscriptions (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint    TEXT NOT NULL UNIQUE,
  p256dh      TEXT NOT NULL,
  auth        TEXT NOT NULL,
  user_agent  TEXT,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_push_subs_user ON push_subscriptions(user_id);
```

---

## 5. Worker — wrangler.toml

```toml
name = "unraidwatch-api"
main = "src/index.ts"
compatibility_date = "2024-09-23"
compatibility_flags = ["nodejs_compat"]

[[d1_databases]]
binding = "DB"
database_name = "unraidwatch"
database_id = "REPLACE_WITH_REAL_ID"

[[kv_namespaces]]
binding = "SESSIONS"
id = "REPLACE_WITH_REAL_ID"

[vars]
ENVIRONMENT = "production"
APP_URL = "https://unraidwatch.pages.dev"  # update to custom domain

# Secrets (set via: wrangler secret put SECRET_NAME)
# ENCRYPTION_KEY       — AES-256 key for encrypting stored API keys
# VAPID_PUBLIC_KEY     — Web Push public key
# VAPID_PRIVATE_KEY    — Web Push private key
# VAPID_SUBJECT        — mailto:you@jeppesen.cc
# SMTP_HOST            — smtp.purelymail.com
# SMTP_PORT            — 587
# SMTP_USER            — alerts@jeppesen.cc
# SMTP_PASS            — Purelymail app password

[triggers]
crons = [
  "0 * * * *",    # Every hour — alert evaluation + SSE polling fallback
  "0 7 * * *"     # Daily 07:00 UTC — briefing schedule check (also re-run per user prefs)
]
```

---

## 6. Worker — Route Map

```
POST   /api/auth/login            Email+password login → set session KV
POST   /api/auth/magic-request    Send magic link email
GET    /api/auth/magic-verify     Verify token → set session KV
POST   /api/auth/logout           Delete session
GET    /api/auth/me               Returns current user info

GET    /api/admin/invites         List pending invites (admin only)
POST   /api/admin/invites         Create invite → send email
DELETE /api/admin/invites/:id     Revoke invite

GET    /api/server                Get user's server config (key redacted)
PUT    /api/server                Save/update server config
POST   /api/server/test           Test connection to Unraid API
DELETE /api/server                Remove server config

GET    /api/ai-config             Get user's AI config (key redacted)
PUT    /api/ai-config             Save/update AI config

GET    /api/sse                   SSE stream — server stats every 5s
                                  Emits: stats | docker | vms | shares | ups | alert

GET    /api/unraid/stats          Proxy → Unraid: CPU, RAM, uptime, temps
GET    /api/unraid/array          Proxy → Unraid: array + disk SMART status
GET    /api/unraid/docker         Proxy → Unraid: container list + stats
POST   /api/unraid/docker/:id/start   Start container
POST   /api/unraid/docker/:id/stop    Stop container
POST   /api/unraid/docker/:id/restart Restart container
GET    /api/unraid/docker/:id/logs    Stream container logs (last 500 lines)
GET    /api/unraid/vms            Proxy → Unraid: VM list + states
POST   /api/unraid/vms/:id/start  Start VM
POST   /api/unraid/vms/:id/stop   Stop VM
GET    /api/unraid/shares         Proxy → Unraid: user shares + usage
GET    /api/unraid/ups            Proxy → Unraid: UPS status
GET    /api/unraid/syslog         Proxy → Unraid: last N syslog lines

POST   /api/ai/analyze            Submit log text → AI analysis → save to D1
GET    /api/ai/history            List user's analysis history (30-day window)
GET    /api/ai/history/:id        Get single analysis detail
DELETE /api/ai/history/:id        Delete single analysis

GET    /api/alerts/rules          List user's alert rules
POST   /api/alerts/rules          Create alert rule
PUT    /api/alerts/rules/:id      Update rule
DELETE /api/alerts/rules/:id      Delete rule
GET    /api/alerts/history        Recent alert firings

GET    /api/briefing/schedule     Get user's briefing schedule
PUT    /api/briefing/schedule     Update briefing schedule

GET    /api/push/vapid-key        Return VAPID public key
POST   /api/push/subscribe        Save push subscription
DELETE /api/push/subscribe        Remove push subscription
```

---

## 7. SSE Event Format

The `/api/sse` endpoint streams newline-delimited events every 5 seconds. The Worker fetches from the user's saved Unraid server config server-side, so the browser never holds the Unraid API key.

```
event: stats
data: {"cpu_pct":12.4,"ram_pct":68.1,"ram_used_gb":10.9,"ram_total_gb":16,"uptime_s":864200,"temp_cpu":41,"temp_mb":38}

event: docker
data: [{"id":"abc123","name":"plex","status":"running","cpu_pct":3.1,"mem_mb":512},...]

event: vms
data: [{"id":"vm1","name":"Win11","status":"running","cpu_pct":1.2,"mem_gb":8},...]

event: array
data: {"status":"normal","parity_status":"ok","disks":[{"slot":"disk1","name":"sda","temp":38,"health":"PASSED","used_gb":800,"total_gb":4000},...],"cache":[...]}

event: shares
data: [{"name":"Media","used_gb":3200,"total_gb":8000,"pct":40},...]

event: ups
data: {"model":"APC Back-UPS 700","status":"online","battery_pct":100,"runtime_min":45,"load_pct":22}

event: alert
data: {"rule_id":"r1","rule_name":"CPU > 90%","metric":"cpu_pct","value":92.1,"severity":"warning"}
```

On reconnect (e.g. tab wakes up), the client re-subscribes and immediately gets a full snapshot.

---

## 8. AI Analysis — Request/Response Contract

### POST /api/ai/analyze

**Request body:**
```json
{
  "source": "syslog",
  "log_text": "<raw log lines, max 8000 chars>",
  "model_override": "claude-haiku-4-5"
}
```
`model_override` is optional; falls back to user's `ai_configs.default_model`.

**Worker behaviour:**
1. Validate session, load user's `ai_configs` row.
2. Decrypt stored API key.
3. Build system prompt (see below).
4. Call appropriate provider SDK.
5. Parse structured JSON response.
6. Insert row into `log_analyses`.
7. Return analysis to client.

**System prompt sent to AI:**
```
You are an expert Unraid system administrator and Linux syslog analyst.
You will be given a block of Unraid system logs or Docker container logs.
Your job is to identify issues, explain root causes, and suggest concrete fix steps.

Respond ONLY with a valid JSON object in this exact shape:
{
  "severity": "ok" | "warning" | "critical",
  "summary": "<2-3 sentence plain-English summary>",
  "findings": [
    {
      "issue": "<short name of the issue>",
      "cause": "<explanation of root cause>",
      "fix": "<concrete steps to resolve, numbered if multi-step>"
    }
  ]
}

If logs appear healthy with no issues, return severity "ok", a positive summary, and an empty findings array.
```

**Response body returned to client:**
```json
{
  "id": "abc123",
  "severity": "warning",
  "summary": "Docker container 'plex' has restarted 4 times in the last hour due to an OOM kill.",
  "findings": [
    {
      "issue": "Plex OOM kills",
      "cause": "Container memory limit set to 512MB but transcoding requires more.",
      "fix": "1. In Unraid Docker settings, raise Plex memory limit to 2048MB.\n2. Enable hardware transcoding to reduce RAM pressure.\n3. Monitor with `docker stats plex`."
    }
  ],
  "model": "claude-haiku-4-5",
  "provider": "claude",
  "source": "docker:plex",
  "created_at": 1700000000
}
```

---

## 9. Auth Flow

### Email + Password
1. `POST /api/auth/login` with `{email, password}`
2. Worker looks up user, verifies bcrypt hash
3. Generates 32-byte random session token
4. Stores `sessions:TOKEN → {user_id, created_at}` in KV with 7-day TTL
5. Returns `Set-Cookie: session=TOKEN; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`

### Magic Link
1. `POST /api/auth/magic-request` with `{email}`
2. If email exists in `users`, generate token, store in KV with 15-min TTL
3. Send email via Purelymail SMTP: `Click here to sign in: {APP_URL}/auth/magic?token=TOKEN`
4. `GET /api/auth/magic-verify?token=TOKEN`
5. Verify token from KV, set session cookie (same as above), redirect to `/`

### Invite Flow
1. Admin calls `POST /api/admin/invites` with `{email}`
2. Worker generates invite token, stores in `invites` table (7-day expiry)
3. Sends invite email via Purelymail: `You've been invited: {APP_URL}/invite?token=TOKEN`
4. User visits link → `AcceptInvite` page → sets password (or just magic-link going forward)
5. Worker creates `users` row, marks invite as used

### Session Validation Middleware
All protected routes pass through `auth.ts` middleware:
- Reads `session` cookie
- Looks up KV: `sessions:TOKEN`
- If missing/expired → 401
- Injects `c.set('user', {id, email, role})` for downstream handlers

---

## 10. API Key Encryption

Stored API keys (Unraid + AI provider) must be encrypted before D1 insert.

```typescript
// services/encryption.ts
const ALGORITHM = { name: 'AES-GCM', length: 256 };

async function getKey(env: Env): Promise<CryptoKey> {
  const raw = Uint8Array.from(atob(env.ENCRYPTION_KEY), c => c.charCodeAt(0));
  return crypto.subtle.importKey('raw', raw, ALGORITHM, false, ['encrypt', 'decrypt']);
}

export async function encrypt(text: string, env: Env): Promise<string> {
  const key = await getKey(env);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(text);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  const combined = new Uint8Array([...iv, ...new Uint8Array(ciphertext)]);
  return btoa(String.fromCharCode(...combined));
}

export async function decrypt(stored: string, env: Env): Promise<string> {
  const key = await getKey(env);
  const combined = Uint8Array.from(atob(stored), c => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return new TextDecoder().decode(plaintext);
}
```

Generate `ENCRYPTION_KEY`: `openssl rand -base64 32` then `wrangler secret put ENCRYPTION_KEY`.

---

## 11. Cron Handler Logic

```typescript
// In index.ts scheduled handler
export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    const hour = new Date().getUTCHours();

    // Every hour: evaluate alert rules for all users with servers configured
    const users = await env.DB.prepare(
      `SELECT u.id, s.url, s.api_key, n.email_alerts, n.push_alerts, n.alert_min_severity
       FROM users u
       JOIN servers s ON s.user_id = u.id
       LEFT JOIN notification_prefs n ON n.user_id = u.id`
    ).all();

    for (const user of users.results) {
      ctx.waitUntil(evaluateAlerts(user, env));
    }

    // Daily briefing: find users whose scheduled hour matches current UTC hour
    const briefingUsers = await env.DB.prepare(
      `SELECT bs.user_id, bs.hour_utc, bs.deliver_via, u.email, s.url, s.api_key, ac.provider, ac.api_key as ai_key, ac.default_model
       FROM briefing_schedules bs
       JOIN users u ON u.id = bs.user_id
       JOIN servers s ON s.user_id = bs.user_id
       JOIN ai_configs ac ON ac.user_id = bs.user_id
       WHERE bs.enabled = 1 AND bs.hour_utc = ?`
    ).bind(hour).all();

    for (const user of briefingUsers.results) {
      ctx.waitUntil(sendDailyBriefing(user, env));
    }
  }
}
```

---

## 12. Frontend — Key Decisions

### State Management
Use **Zustand** for global state (auth, theme, server connection status). React Query for all API data fetching with caching.

### SSE Hook
```javascript
// hooks/useSSE.js
export function useSSE() {
  const [data, setData] = useState({});
  useEffect(() => {
    const es = new EventSource('/api/sse', { withCredentials: true });
    es.addEventListener('stats',  e => setData(d => ({...d, stats: JSON.parse(e.data)})));
    es.addEventListener('docker', e => setData(d => ({...d, docker: JSON.parse(e.data)})));
    es.addEventListener('vms',    e => setData(d => ({...d, vms: JSON.parse(e.data)})));
    es.addEventListener('array',  e => setData(d => ({...d, array: JSON.parse(e.data)})));
    es.addEventListener('shares', e => setData(d => ({...d, shares: JSON.parse(e.data)})));
    es.addEventListener('ups',    e => setData(d => ({...d, ups: JSON.parse(e.data)})));
    es.addEventListener('alert',  e => handleAlert(JSON.parse(e.data)));
    es.onerror = () => { es.close(); setTimeout(() => reconnect(), 5000); };
    return () => es.close();
  }, []);
  return data;
}
```

### Theme
CSS custom properties + `data-theme="dark"|"light"` on `<html>`. Persisted in `localStorage`. Toggled via a button in the top bar.

### Routing
React Router v6. Protected routes wrap with auth check. Structure:
```
/login
/invite            → AcceptInvite
/                  → Dashboard (protected)
/docker            → Docker (protected)
/vms               → VMs (protected)
/shares            → Shares (protected)
/ups               → UPS (protected)
/ai                → AI Analysis (protected)
/alerts            → Alerts (protected)
/settings          → Settings (protected)
/settings/server   → Server Config
/settings/ai       → AI Config
/settings/profile  → Profile + password change
/settings/notifications → Push + email prefs
/admin/invites     → Invite management (admin only)
```

### AI Analysis Page Layout
- Left pane: log source selector (syslog / docker dropdown / manual paste), model override selector, Analyze button
- Right pane: latest analysis result with severity badge, summary, expandable findings cards
- Bottom: analysis history table (date, source, severity, summary snippet, view button)
- Scheduled briefing toggle + time picker in Settings > Notifications

---

## 13. Environment Variables Summary

### Worker secrets (set via `wrangler secret put`)
| Secret | Description |
|---|---|
| `ENCRYPTION_KEY` | Base64 AES-256 key for API key encryption |
| `VAPID_PUBLIC_KEY` | Web Push VAPID public key |
| `VAPID_PRIVATE_KEY` | Web Push VAPID private key |
| `VAPID_SUBJECT` | `mailto:alerts@jeppesen.cc` |
| `SMTP_HOST` | `smtp.purelymail.com` |
| `SMTP_PORT` | `587` |
| `SMTP_USER` | `alerts@jeppesen.cc` |
| `SMTP_PASS` | Purelymail app password |

### Worker vars (in wrangler.toml)
| Var | Value |
|---|---|
| `ENVIRONMENT` | `production` |
| `APP_URL` | Your Pages URL or custom domain |

### Frontend env (Vite, `.env.production`)
| Var | Value |
|---|---|
| `VITE_API_URL` | Worker URL (or `/` if same origin via Pages routing) |

---

## 14. GitHub Actions — Deployment

### .github/workflows/deploy-worker.yml
```yaml
name: Deploy Worker
on:
  push:
    branches: [main]
    paths: ['worker/**']
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: jdx/mise-action@v2
      - run: cd worker && npm ci
      - run: cd worker && npx wrangler deploy
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CF_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CF_ACCOUNT_ID }}
```

### .github/workflows/deploy-frontend.yml
```yaml
name: Deploy Frontend
on:
  push:
    branches: [main]
    paths: ['frontend/**']
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: jdx/mise-action@v2
      - run: cd frontend && npm ci && npm run build
        env:
          VITE_API_URL: ${{ secrets.VITE_API_URL }}
      - run: cd frontend && npx wrangler pages deploy dist --project-name unraidwatch
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CF_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CF_ACCOUNT_ID }}
```

---

## 15. Unraid API Notes

Unraid 7.2 exposes a GraphQL API at `http://{server}/graphql` authenticated via API key in the `Authorization: Bearer {key}` header. Key queries to implement:

```graphql
# System stats
query { info { cpu { usage } memory { used total } uptime } }

# Array / disk status
query { array { state disks { name temp smart { status } size used } } }

# Docker containers
query { docker { containers { id name status cpu memory } } }

# VMs
query { vms { domains { id name status memory vcpus } } }

# Shares
query { shares { name size used } }

# UPS
query { ups { model status battery load runtime } }
```

> **Note:** Verify exact field names against the live Unraid 7.2 API schema — query introspection endpoint on first connect: `POST /graphql` with `{"query":"{ __schema { types { name fields { name } } } }"}`.

---

## 16. Build Order (Recommended for Claude Code)

1. **Init monorepo** — `package.json` at root, `/frontend` (Vite + React), `/worker` (Hono + TypeScript), `/migrations`
2. **D1 + KV setup** — run all 3 migrations, bind in `wrangler.toml`
3. **Worker: auth routes** — login, magic link, logout, me, session middleware
4. **Worker: admin/invite routes** — create invite, send email, accept invite
5. **Worker: server config routes** — save/test/get server config (with encryption)
6. **Worker: AI config routes** — save/get AI config (with encryption)
7. **Worker: Unraid proxy routes** — all `/api/unraid/*` routes using `unraidClient.ts`
8. **Worker: SSE endpoint** — live polling loop, emit typed events
9. **Worker: AI analysis route** — multi-provider abstraction, D1 save
10. **Worker: alerts + cron** — rule CRUD, evaluation logic, email/push delivery
11. **Frontend: auth pages** — Login, AcceptInvite, route guards
12. **Frontend: layout** — Sidebar, TopBar, ThemeToggle, routing skeleton
13. **Frontend: Dashboard** — SSE hook, stat cards, CPU/RAM charts (recharts)
14. **Frontend: Docker page** — container list, start/stop/restart, log viewer + AI analyze button
15. **Frontend: VMs page** — VM list, start/stop
16. **Frontend: Shares page** — share cards with usage bars
17. **Frontend: UPS page** — UPS status card
18. **Frontend: AI Analysis page** — log submission, results display, history table
19. **Frontend: Alerts page** — rule builder, history
20. **Frontend: Settings pages** — server config form, AI config form, notification prefs, briefing schedule
21. **GitHub Actions** — CI/CD for both worker and frontend
22. **Polish** — error states, empty states, loading skeletons, PWA manifest

---

## 17. Key Constraints & Reminders

- **Never expose Unraid API keys to the browser.** All Unraid calls go through the Worker.
- **Never expose AI provider keys to the browser.** Same — proxied via Worker.
- **Encrypt all stored API keys** using AES-GCM before D1 insert. Decrypt only in Worker memory.
- **SSE in Cloudflare Workers** requires `TransformStream` + `ReadableStream` — do not use Node stream APIs.
- **D1 is SQLite** — use `INTEGER` not `BOOLEAN`, `unixepoch()` for timestamps, no `RETURNING` clause (not supported in all D1 versions — re-query after insert instead).
- **Hono** is the recommended Worker framework — lightweight, first-class CF support, typed middleware.
- **bcrypt** is not available natively in Workers — use `@noble/hashes` (scrypt or argon2 alternative) or `bcryptjs` compiled for edge runtime. Recommended: `@noble/hashes` scrypt.
- **`wrangler dev`** for local development — it emulates D1 and KV locally.
- **Cloudflare account ID**: `98b26d7882...` (already known from other projects).
- **Purelymail SMTP**: use `nodemailer` compiled for edge, or a simple raw SMTP-over-fetch approach. Worker-compatible option: use Purelymail's API if available, otherwise use `EmailMessage` + `send()` via Cloudflare Email Workers binding.
- **mise** manages Node/npm versions — ensure `.mise.toml` is present in repo root.
