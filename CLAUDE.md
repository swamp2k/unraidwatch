# UnraidWatch — Developer Guide

Self-hostable monitoring dashboard for Unraid 7.2+ servers. Connects to Unraid's GraphQL API for live stats, Docker/VM management, log analysis, and alerting.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, TypeScript, React Query, React Router v6, Zustand |
| Backend | Cloudflare Workers (Hono v4), TypeScript |
| Database | Cloudflare D1 (SQLite) |
| Sessions | Cloudflare KV |
| Real-time | Server-Sent Events (Worker → browser, every 5s) |
| Notifications | Email via SMTP + Web Push (VAPID) |
| AI | Anthropic Claude / Google Gemini / OpenAI (user-configured) |
| Runtime | Node 22 (managed via mise) |

## Repo Layout

```
unraidwatch/
├── frontend/src/
│   ├── pages/          # Dashboard, Settings, LogMonitor, DockerMonitor, Alerts, …
│   ├── components/     # layout/ (TopBar, Sidebar) + widgets/
│   ├── hooks/          # useAuth, useSSE
│   └── lib/api.ts      # Typed fetch helpers: get/post/put/patch/delete
├── worker/src/
│   ├── index.ts        # App entry + cron scheduler
│   ├── types.ts        # Shared TypeScript interfaces (Env, UserRow, ServerConfig, …)
│   ├── routes/         # Hono route handlers (auth, server, unraid, monitors, …)
│   └── services/       # Business logic (unraidClient, alertEngine, emailService, …)
├── migrations/         # Numbered D1 SQL migrations (0001_initial.sql → 0009_…)
└── .github/workflows/  # deploy-worker.yml, deploy-frontend.yml
```

## Dev Commands

```bash
npm install          # installs both workspaces
npm run dev:worker   # Cloudflare Worker emulator on :8787
npm run dev:frontend # React dev server on :5173
```

Worker emulates D1 and KV locally via wrangler. Migrations run automatically on first `wrangler dev` session.

## Cron Jobs (`worker/src/index.ts`)

| Schedule | Tasks |
|---|---|
| `* * * * *` (per-minute) | `evaluateDockerMonitors`, `evaluateLogMonitors`, `collectMetrics`, `checkServerAvailability` |
| `0 * * * *` (hourly) | `evaluateAlerts` |
| `0 7 * * *` (daily) | briefing schedule delivery |

All async work wrapped in `ctx.waitUntil()`. To add a new periodic task: create a service in `worker/src/services/`, import it in `index.ts`, add `ctx.waitUntil(yourFn(user, env))` in the appropriate cron block.

## Database Migrations

Files live in `migrations/` with ascending numeric prefixes. CI applies them automatically on deploy:

```bash
wrangler d1 migrations apply unraidwatch --remote
```

For local use:
```bash
wrangler d1 execute unraidwatch --file ./migrations/NNNN_name.sql --local
```

New migration = next numbered file. Use `ALTER TABLE … ADD COLUMN` for additions (safe/idempotent). The `monitor_events` table is the shared audit log for all monitor types (`docker`, `log`, `server_availability`).

## Deployment

GitHub Actions auto-deploys on push to `main`:
- Changes in `worker/**` or `migrations/**` → `deploy-worker.yml` (applies migrations, then deploys Worker)
- Changes in `frontend/**` → `deploy-frontend.yml` (build → Cloudflare Pages)

Manual:
```bash
cd worker && wrangler deploy
cd frontend && npm run build && wrangler pages deploy dist --project-name unraidwatch
```

## Worker Secrets

Set via `wrangler secret put <NAME>`:

| Secret | Purpose |
|---|---|
| `ENCRYPTION_KEY` | Base64-encoded AES-256 key for stored Unraid + AI API keys |
| `VAPID_PUBLIC_KEY` | Web Push public key |
| `VAPID_PRIVATE_KEY` | Web Push private key |
| `VAPID_SUBJECT` | `mailto:` address for VAPID |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | Email delivery |

`APP_URL` and `ENVIRONMENT` are plain vars in `wrangler.toml`.

## Key Patterns

- **Encryption**: All API keys stored AES-256-GCM encrypted — see `worker/src/services/encryption.ts`. Decrypt in Worker memory only; never expose to client.
- **Types**: `worker/src/types.ts` is the single source of truth — update `ServerConfig`, `UserRow`, `MonitorEvent`, etc. here when adding DB columns.
- **Notifications**: `sendEmail` + `sendPushToUser` in `worker/src/services/`. Both are non-fatal (log on failure, don't throw). Respect `user.email_alerts` / `user.push_alerts` flags before calling.
- **Monitor cooldowns**: Docker and log monitors use `last_fired_at` + `cooldown_s` to suppress repeated alerts. Follow the same pattern in new monitors.
- **Frontend theming**: CSS variables only (`var(--bg)`, `var(--danger)`, etc.); no Tailwind. `data-theme="dark"|"light"` on `<html>`.
- **D1 conventions**: Timestamps as `INTEGER` via `unixepoch()`. Booleans as `INTEGER` (0/1). Per-user config tables use `UNIQUE` on `user_id`.
