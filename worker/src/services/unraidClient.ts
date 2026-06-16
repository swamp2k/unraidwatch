export interface UnraidStats {
  cpu_pct: number;
  ram_pct: number;
  ram_used_gb: number;
  ram_total_gb: number;
  uptime_s: number;
  temp_avg: number;
  net_rx_kbps: number;
  net_tx_kbps: number;
}

export interface UnraidDisk {
  slot: string;
  name: string;
  temp: number;
  health: string;
  used_gb: number;
  total_gb: number;
}

export interface UnraidArray {
  status: string;
  capacity_used_tb: number;
  capacity_total_tb: number;
  disks: UnraidDisk[];
  cache: UnraidDisk[];
}

export interface UnraidContainer {
  id: string;
  name: string;
  status: string;
  cpu_pct: number;
  mem_mb: number;
  net_rx_kbps: number;
  net_tx_kbps: number;
}

export interface UnraidVM {
  id: string;
  name: string;
  status: string;
  cpu_pct: number;
  mem_gb: number;
}

export interface UnraidShare {
  name: string;
  used_gb: number;
  total_gb: number;
  pct: number;
}

export interface UnraidUPS {
  model: string;
  status: string;
  battery_pct: number;
  runtime_min: number;
  load_pct: number;
}

async function gql(url: string, apiKey: string, query: string): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(`${url}/graphql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Cannot reach Unraid server at ${url} — ${msg}. Check the URL and ensure the server is online.`);
  }
  if (!res.ok) throw new Error(`Unraid API returned HTTP ${res.status}. Check that your API key is correct.`);
  const json = await res.json() as { data?: unknown; errors?: Array<{ message: string }> };
  if (json.errors?.length) {
    throw new Error(json.errors[0]?.message ?? 'GraphQL error');
  }
  return json.data;
}

export async function getStats(url: string, apiKey: string): Promise<UnraidStats> {
  const data = await gql(url, apiKey, `
    query {
      metrics {
        cpu { percentTotal }
        memory { total used percentTotal }
        temperature { summary { average } }
      }
      info { os { uptime } }
    }
  `) as {
    metrics: {
      cpu: { percentTotal: number };
      memory: { total: number; used: number; percentTotal: number };
      temperature: { summary: { average: number } } | null;
    };
    info: { os: { uptime: string } };
  };

  const { metrics, info } = data;
  const totalGb = metrics.memory.total / 1024 / 1024 / 1024;
  const usedGb = metrics.memory.used / 1024 / 1024 / 1024;
  // info.os.uptime is the boot timestamp as an ISO string
  const uptimeS = Math.floor((Date.now() - new Date(info.os.uptime).getTime()) / 1000);

  return {
    cpu_pct: Math.round(metrics.cpu.percentTotal * 10) / 10,
    ram_pct: Math.round(metrics.memory.percentTotal),
    ram_used_gb: Math.round(usedGb * 10) / 10,
    ram_total_gb: Math.round(totalGb),
    uptime_s: Math.max(0, uptimeS),
    temp_avg: Math.round(metrics.temperature?.summary?.average ?? 0),
    net_rx_kbps: 0,
    net_tx_kbps: 0,
  };
}

// Attempt to fetch system-level network throughput — returns null if the
// Unraid API version doesn't expose this data.
export async function getNetworkStats(url: string, apiKey: string): Promise<{ rx_kbps: number; tx_kbps: number } | null> {
  try {
    const data = await gql(url, apiKey, `
      query {
        metrics {
          network {
            name
            rxSec
            txSec
          }
        }
      }
    `) as {
      metrics: {
        network: Array<{ name: string; rxSec: number; txSec: number }> | null;
      };
    };

    const ifaces = data?.metrics?.network;
    if (!ifaces?.length) return null;

    // Sum across all interfaces, exclude loopback and virtual interfaces
    let rx = 0, tx = 0;
    for (const iface of ifaces) {
      if (iface.name === 'lo') continue;
      rx += iface.rxSec ?? 0;
      tx += iface.txSec ?? 0;
    }
    return {
      rx_kbps: Math.round(rx / 1000),
      tx_kbps: Math.round(tx / 1000),
    };
  } catch {
    return null;
  }
}

interface RawDisk {
  idx: number;
  name: string | null;
  device: string | null;
  temp: number | null;
  status: string | null;
  fsSize: number | null;
  fsFree: number | null;
  fsUsed: number | null;
  type: string;
}

function mapDisk(d: RawDisk, prefix: string): UnraidDisk {
  const totalKb = d.fsSize ?? 0;
  const usedKb = d.fsUsed ?? 0;
  return {
    slot: `${prefix}${d.idx}`,
    name: d.name ?? d.device ?? `${prefix}${d.idx}`,
    temp: d.temp ?? 0,
    health: d.status ?? 'UNKNOWN',
    used_gb: Math.round(usedKb / 1024 / 1024),
    total_gb: Math.round(totalKb / 1024 / 1024),
  };
}

export async function getArray(url: string, apiKey: string): Promise<UnraidArray> {
  const data = await gql(url, apiKey, `
    query {
      array {
        state
        capacity { kilobytes { free used total } }
        disks { idx name device temp status fsSize fsFree fsUsed type }
        caches { idx name device temp status fsSize fsFree fsUsed type }
      }
    }
  `) as {
    array: {
      state: string;
      capacity: { kilobytes: { free: string; used: string; total: string } };
      disks: RawDisk[];
      caches: RawDisk[];
    };
  };

  const kb = data.array.capacity.kilobytes;
  return {
    status: data.array.state,
    capacity_used_tb: Math.round(parseInt(kb.used) / 1024 / 1024 / 1024 * 10) / 10,
    capacity_total_tb: Math.round(parseInt(kb.total) / 1024 / 1024 / 1024 * 10) / 10,
    disks: data.array.disks.map(d => mapDisk(d, 'disk')),
    cache: data.array.caches.map(d => mapDisk(d, 'cache')),
  };
}

export async function getContainers(url: string, apiKey: string): Promise<UnraidContainer[]> {
  const data = await gql(url, apiKey, `
    query {
      docker {
        containers { id names state status }
      }
    }
  `) as {
    docker: {
      containers: Array<{ id: string; names: string[]; state: string; status: string }>;
    };
  };

  return data.docker.containers.map(c => ({
    id: c.id,
    name: (c.names[0] ?? 'unknown').replace(/^\//, ''),
    status: c.state.toLowerCase(),
    cpu_pct: 0,
    mem_mb: 0,
    net_rx_kbps: 0,
    net_tx_kbps: 0,
  }));
}

export async function getVMs(url: string, apiKey: string): Promise<UnraidVM[]> {
  const data = await gql(url, apiKey, `
    query { vms { domains { id name state } } }
  `) as {
    vms: { domains: Array<{ id: string; name: string | null; state: string }> | null };
  };

  return (data.vms.domains ?? []).map(v => ({
    id: v.id,
    name: v.name ?? v.id,
    status: v.state.toLowerCase(),
    cpu_pct: 0,
    mem_gb: 0,
  }));
}

export async function getShares(url: string, apiKey: string): Promise<UnraidShare[]> {
  const data = await gql(url, apiKey, `
    query { shares { name free used } }
  `) as {
    shares: Array<{ name: string; free: number | null; used: number | null }>;
  };

  return data.shares
    .filter(s => s.name && (s.used ?? 0) > 0)
    .map(s => {
      const usedKb = s.used ?? 0;
      const freeKb = s.free ?? 0;
      const totalKb = usedKb + freeKb;
      const usedGb = Math.round(usedKb / 1024 / 1024);
      const totalGb = Math.round(totalKb / 1024 / 1024);
      return {
        name: s.name,
        used_gb: usedGb,
        total_gb: totalGb,
        pct: totalGb > 0 ? Math.round((usedGb / totalGb) * 100) : 0,
      };
    });
}

export async function getUPS(url: string, apiKey: string): Promise<UnraidUPS | null> {
  try {
    const data = await gql(url, apiKey, `
      query {
        upsDevices {
          id name model status
          battery { chargeLevel estimatedRuntime }
          power { loadPercentage }
        }
      }
    `) as {
      upsDevices: Array<{
        id: string; name: string; model: string; status: string;
        battery: { chargeLevel: number; estimatedRuntime: number };
        power: { loadPercentage: number };
      }>;
    };
    const ups = data.upsDevices[0];
    if (!ups) return null;
    return {
      model: ups.model,
      status: ups.status,
      battery_pct: ups.battery.chargeLevel,
      runtime_min: ups.battery.estimatedRuntime,
      load_pct: ups.power.loadPercentage,
    };
  } catch {
    return null;
  }
}

// ── Container stats via WebSocket subscription ─────────────────────────────

export interface ContainerStatEntry {
  cpu: number;
  memMb: number;
  netRxKbps: number;
  netTxKbps: number;
  // Internal: previous cumulative byte values for rate calculation
  _prevRxBytes?: number;
  _prevTxBytes?: number;
  _prevTs?: number;
}

function parseMemMb(raw: string): number {
  const used = raw.split('/')[0]?.trim() ?? '';
  const m = used.match(/([\d.]+)\s*(GiB|MiB|KiB|GB|MB|KB)/i);
  if (!m) return 0;
  const v = parseFloat(m[1]!);
  switch (m[2]!.toLowerCase()) {
    case 'gib': case 'gb': return Math.round(v * 1024);
    case 'kib': case 'kb': return Math.round(v / 1024);
    default: return Math.round(v);
  }
}

// Parse a byte size like "1.2MB" or "512KiB" into raw bytes.
function parseBytes(raw: string): number {
  const m = raw.trim().match(/([\d.]+)\s*([KMGT]?i?B)/i);
  if (!m) return 0;
  const v = parseFloat(m[1]!);
  switch (m[2]!.toLowerCase()) {
    case 'b':   return v;
    case 'kb':  return v * 1e3;
    case 'kib': return v * 1024;
    case 'mb':  return v * 1e6;
    case 'mib': return v * 1024 ** 2;
    case 'gb':  return v * 1e9;
    case 'gib': return v * 1024 ** 3;
    case 'tb':  return v * 1e12;
    case 'tib': return v * 1024 ** 4;
    default:    return v;
  }
}

// dockerContainerStats.netIO is a cumulative "rx / tx" string, e.g. "1.2MB / 3.4MB".
function parseNetIO(raw: string): { rx: number; tx: number } {
  const parts = raw.split('/');
  return { rx: parseBytes(parts[0] ?? ''), tx: parseBytes(parts[1] ?? '') };
}

export function startContainerStatsWs(
  url: string,
  apiKey: string,
  cache: Map<string, ContainerStatEntry>,
  signal: AbortSignal,
): void {
  // Workers open outbound WebSockets via fetch()+Upgrade, which requires the
  // original http(s):// scheme — fetch() throws on ws://wss:// URLs.
  const wsUrl = url.replace(/\/$/, '') + '/graphql';
  const STATS_QUERY = 'subscription { dockerContainerStats { id cpuPercent memUsage netIO } }';

  type StatMsg = { id: string; cpuPercent: number; memUsage: string; netIO?: string };

  function handleStat(s: StatMsg) {
    const prev = cache.get(s.id);
    const now = Date.now();
    const { rx, tx } = parseNetIO(s.netIO ?? '');
    // Net rate is a byte-delta between two pushes. Note that Unraid's
    // dockerContainerStats often replays duplicate snapshot frames back-to-back
    // and reports netIO coarsely rounded (~0.1MB), so over a short sampling
    // window this frequently stays 0 for low-traffic containers. CPU/mem are
    // absolute per-frame and are unaffected.
    let netRxKbps = 0;
    let netTxKbps = 0;
    if (
      prev?._prevRxBytes !== undefined &&
      prev._prevTxBytes !== undefined &&
      prev._prevTs !== undefined
    ) {
      const elapsed = (now - prev._prevTs) / 1000;
      if (elapsed > 0) {
        netRxKbps = Math.max(0, Math.round((rx - prev._prevRxBytes) / elapsed / 1000));
        netTxKbps = Math.max(0, Math.round((tx - prev._prevTxBytes) / elapsed / 1000));
      }
    }
    cache.set(s.id, {
      cpu: Math.round(s.cpuPercent * 10) / 10,
      memMb: parseMemMb(s.memUsage),
      netRxKbps,
      netTxKbps,
      _prevRxBytes: rx,
      _prevTxBytes: tx,
      _prevTs: now,
    });
  }

  // Cloudflare Workers cannot open outbound WebSockets with the `new WebSocket()`
  // constructor — they must be created via fetch() with an Upgrade header, then accept()ed.
  async function runOnce(): Promise<void> {
    const resp = await fetch(wsUrl, {
      headers: {
        Upgrade: 'websocket',
        Connection: 'Upgrade',
        'Sec-WebSocket-Protocol': 'graphql-transport-ws, graphql-ws',
      },
    });
    const ws = resp.webSocket;
    if (!ws) {
      console.error(`[containerStats] WebSocket upgrade failed: HTTP ${resp.status}`);
      return;
    }
    // The server echoes the chosen subprotocol; default to the modern one.
    const isNewProtocol = (resp.headers.get('Sec-WebSocket-Protocol') ?? 'graphql-transport-ws') !== 'graphql-ws';
    ws.accept();

    await new Promise<void>((resolve) => {
      signal.addEventListener('abort', () => {
        try { ws.close(1000, 'done'); } catch { /* already closed */ }
        resolve();
      }, { once: true });
      ws.addEventListener('close', () => resolve());
      ws.addEventListener('error', () => resolve());

      ws.addEventListener('message', (evt: MessageEvent) => {
        try {
          const msg = JSON.parse(evt.data as string) as {
            type: string;
            id?: string;
            payload?: { data?: { dockerContainerStats?: StatMsg } };
          };

          if (msg.type === 'connection_ack') {
            // graphql-transport-ws uses 'subscribe'; graphql-ws (older) uses 'start'
            ws.send(JSON.stringify({
              id: '1',
              type: isNewProtocol ? 'subscribe' : 'start',
              payload: { query: STATS_QUERY },
            }));
          } else if (msg.type === 'next' || msg.type === 'data') {
            // 'next' = graphql-transport-ws, 'data' = graphql-ws
            const s = msg.payload?.data?.dockerContainerStats;
            if (s) handleStat(s);
          } else if (msg.type === 'error') {
            console.error('[containerStats] subscription error:', JSON.stringify(msg.payload));
          }
        } catch { /* ignore parse errors */ }
      });

      // Workers fetch-based sockets have no 'open' event — send connection_init now.
      ws.send(JSON.stringify({ type: 'connection_init', payload: { 'x-api-key': apiKey } }));
    });
  }

  async function run(): Promise<void> {
    while (!signal.aborted) {
      try {
        await runOnce();
      } catch (err) {
        console.error('[containerStats] connection failed:', err);
      }
      if (!signal.aborted) await new Promise(r => setTimeout(r, 3000));
    }
  }

  void run();
}


export async function containerAction(url: string, apiKey: string, id: string, action: 'start' | 'stop' | 'restart'): Promise<void> {
  if (action === 'restart') {
    await gql(url, apiKey, `mutation { docker { stop(id: "${id}") { id } } }`);
    await new Promise(r => setTimeout(r, 3000));
    await gql(url, apiKey, `mutation { docker { start(id: "${id}") { id } } }`);
  } else {
    await gql(url, apiKey, `mutation { docker { ${action}(id: "${id}") { id } } }`);
  }
}

export async function vmAction(url: string, apiKey: string, id: string, action: 'start' | 'stop'): Promise<void> {
  await gql(url, apiKey, `mutation { vm { ${action}(id: "${id}") } }`);
}

export async function getSyslog(url: string, apiKey: string, lines = 10000): Promise<string> {
  const data = await gql(url, apiKey, `
    query { logFile(path: "/var/log/syslog", lines: ${lines}) { content } }
  `) as { logFile: { content: string } };
  return data.logFile.content;
}

export async function getContainerLogs(url: string, apiKey: string, containerId: string): Promise<string> {
  const data = await gql(url, apiKey, `
    query { docker { logs(id: "${containerId}", tail: 500) { lines { message } } } }
  `) as { docker: { logs: { lines: Array<{ message: string }> } } };
  return data.docker.logs.lines.map(l => l.message).join('\n');
}
