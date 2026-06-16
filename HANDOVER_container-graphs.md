# Handover: Verify & ship the container-graph fix

**Branch:** `claude/container-graph-updates-xidev3`
**Status:** Code changes are committed & pushed. They have NOT been deployed or
verified against a live Unraid server (the authoring environment couldn't reach the
server). Your job: deploy, verify with real data, fix anything that surfaces, report back.

---

## Background — what was broken and why

Container history graphs (and the live per-container CPU/RAM/net numbers) were always
empty/zero, while system/host graphs worked. Root cause was the `dockerContainerStats`
pipeline, which had **two independent, each-fatal bugs**:

1. **Workers-incompatible WebSocket.** The code opened the subscription with the browser
   `new WebSocket()` constructor. Cloudflare Workers does not support that for *outbound*
   connections — you must use `fetch(url, { headers: { Upgrade: 'websocket' } })` then
   `response.webSocket` + `ws.accept()`. The socket never connected, so the stats cache
   was always empty and every container metric persisted as 0.
2. **Non-existent GraphQL fields.** The subscription asked for `networkRxBytes` /
   `networkTxBytes`, which don't exist. Live introspection of the Unraid schema confirmed
   `DockerContainerStats` is `{ id, cpuPercent (Float), memUsage (String), memPercent
   (Float), netIO (String), blockIO (String) }`. `netIO` is a cumulative `"rx / tx"`
   string (e.g. `"1.2MB / 3.4MB"`). Even a working socket would have had the whole
   subscription rejected.

Also: metric persistence used to run *only inside the SSE request handler*, so history
only accrued while a dashboard was open. It now runs in the per-minute cron.

## What changed (already committed on this branch)

- `worker/src/services/unraidClient.ts` — `startContainerStatsWs` now connects via
  `fetch`+Upgrade+`accept()`; subscription uses real fields `{ id cpuPercent memUsage
  netIO }`; network rate derived from `netIO` byte deltas (`parseBytes`/`parseNetIO`).
  Logs `[containerStats] subscription error:` if the server rejects the query.
- `worker/src/services/metricsCollector.ts` — **new**. `collectMetrics(user, env)` opens a
  short-lived (~8s) stats subscription, fetches system stats + container list, and writes
  `system_metrics` + `container_metrics` for the minute bucket. Logs
  `[metrics] user=<id> running=<n> withStats=<n>`.
- `worker/src/index.ts` — per-minute cron (`* * * * *`) now calls
  `ctx.waitUntil(collectMetrics(user, env))`.
- `worker/src/routes/sse.ts` — stripped all DB writes; now purely live streaming off the
  (now working) stats cache.
- `worker/src/routes/metrics.ts` — container-history endpoint logs query failures instead
  of silently returning `[]`.

Build status from authoring env: `npx tsc --noEmit` clean for these files (2 *pre-existing*
warnings in `index.ts:onError` and `cors.ts` are unrelated); `wrangler deploy --dry-run`
bundles OK.

---

## Steps to run (you are on the user's machine and CAN reach Unraid)

```bash
git checkout claude/container-graph-updates-xidev3
git pull
cd worker
npm install
npx wrangler deploy
```

### Verify (this is the actual deliverable — don't skip)

1. **Watch logs for one cron tick (~1 min):**
   ```bash
   npx wrangler tail --format pretty
   ```
   - ✅ Expect a line like `[metrics] user=... running=N withStats=M` with **M > 0**.
   - ❌ `[containerStats] subscription error: ...` → Unraid rejected the subscription.
     Read the GraphQL message; the field names in
     `unraidClient.ts` `STATS_QUERY` need to match the live schema. Re-introspect:
     ```bash
     # needs the Unraid URL + API key (ask the user; a temp key was used during design)
     curl -s -X POST "$URL/graphql" -H "Content-Type: application/json" -H "x-api-key: $KEY" \
       --data '{"query":"{__type(name:\"DockerContainerStats\"){fields{name}}}"}'
     ```

2. **Confirm rows land with real values (after ~3 min):**
   ```bash
   npx wrangler d1 execute unraidwatch --remote --command \
     "SELECT container_name, ts, cpu_pct, mem_mb, net_rx_kbps FROM container_metrics ORDER BY ts DESC LIMIT 10"
   ```
   - ✅ Expect **non-zero** `cpu_pct` / `mem_mb` for running containers.
   - ❌ All zeros while `running` > 0 in the logs → see "ID mismatch" below.

3. **UI check:** open the dashboard. Live container CPU/RAM columns should populate within
   a few seconds; expand a running container → the history chart fills in after 2+ minutes.
   (Chart needs ≥2 minute-buckets before it draws — see `ContainerHistory`,
   `frontend/src/pages/Docker.tsx:113`.)

---

## Likely follow-ups / decision tree

- **`withStats=0` but containers are running** → the stats subscription isn't delivering, or
  the IDs don't line up. The live merge keys on container `id` (`sse.ts` and
  `metricsCollector.ts` use `statsCache.get(ct.id)`). Both `id`s come from the Unraid docker
  schema (`PrefixedID`) and should match. To diagnose, temporarily log
  `[...statsCache.keys()]` vs the container `id`s inside `collectMetrics` and compare.
- **`netIO` parses wrong** (net graph flat but cpu/mem fine) → check the real string format in
  a `next` message; adjust `parseBytes` units in `unraidClient.ts`. Note net rate needs ≥2
  pushes within the 8s `SAMPLE_MS` window — bump `SAMPLE_MS` in `metricsCollector.ts` if the
  server pushes slowly.
- **8s sample too long for the cron** → it runs under `ctx.waitUntil`; I/O wait doesn't count
  against CPU time, so this is fine, but if you see cron timeouts, lower `SAMPLE_MS`.

## Guardrails

- Do NOT open a pull request unless the user asks.
- Commit any fixes to `claude/container-graph-updates-xidev3` only.
- If verification fully passes, say so plainly and delete this handover file in the same
  commit. If it doesn't, report the exact log/SQL output and where you're stuck.
