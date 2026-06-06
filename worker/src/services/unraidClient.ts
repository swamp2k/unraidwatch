export interface UnraidStats {
  cpu_pct: number;
  ram_pct: number;
  ram_used_gb: number;
  ram_total_gb: number;
  uptime_s: number;
  temp_avg: number;
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

export interface UnraidShareConfig {
  name: string;
  use_cache: string;       // "yes" | "no" | "only" | "prefer"
  allocator: string;
  split_level: number | null;
  include: string;
  exclude: string;
  cache_floor: string;
}

export interface UnraidPlugin {
  name: string;
  version: string;
  status: string;
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
  // Surface only the first error (ignore partial-data errors for optional fields)
  if (json.errors?.length && !json.data) {
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
  };
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

export interface ContainerStatEntry { cpu: number; memMb: number }

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

export function startContainerStatsWs(
  url: string,
  apiKey: string,
  cache: Map<string, ContainerStatEntry>,
  signal: AbortSignal,
): void {
  const wsUrl = url.replace(/^http/, 'ws') + '/graphql';

  async function run(): Promise<void> {
    while (!signal.aborted) {
      try {
        await new Promise<void>((resolve) => {
          const ws = new WebSocket(wsUrl, ['graphql-transport-ws']);

          signal.addEventListener('abort', () => { ws.close(1000, 'done'); resolve(); }, { once: true });
          ws.addEventListener('close', () => resolve());
          ws.addEventListener('error', () => resolve());

          ws.addEventListener('open', () => {
            // graphql-transport-ws auth: send API key in connection_init payload
            ws.send(JSON.stringify({ type: 'connection_init', payload: { 'x-api-key': apiKey } }));
          });

          ws.addEventListener('message', (evt: MessageEvent) => {
            try {
              const msg = JSON.parse(evt.data as string) as {
                type: string;
                payload?: { data?: { dockerContainerStats?: { id: string; cpuPercent: number; memUsage: string } } };
              };
              if (msg.type === 'connection_ack') {
                ws.send(JSON.stringify({
                  id: '1', type: 'subscribe',
                  payload: { query: 'subscription { dockerContainerStats { id cpuPercent memUsage } }' },
                }));
              } else if (msg.type === 'next') {
                const s = msg.payload?.data?.dockerContainerStats;
                if (s) cache.set(s.id, { cpu: Math.round(s.cpuPercent * 10) / 10, memMb: parseMemMb(s.memUsage) });
              }
            } catch { /* ignore parse errors */ }
          });
        });
      } catch { /* connection failed */ }

      if (!signal.aborted) await new Promise(r => setTimeout(r, 3000));
    }
  }

  void run();
}

export async function containerAction(url: string, apiKey: string, id: string, action: 'start' | 'stop' | 'restart'): Promise<void> {
  // Container IDs from the API are "serverid:containerid" — extract the container portion
  const containerId = id.includes(':') ? id.split(':')[1]! : id;
  await gql(url, apiKey, `mutation { docker { ${action}Container(id: "${containerId}") } }`);
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

export async function getShareConfigs(url: string, apiKey: string): Promise<UnraidShareConfig[]> {
  const data = await gql(url, apiKey, `
    query {
      shares {
        name
        useCache
        allocator
        splitLevel
        include
        exclude
        cacheFloor
      }
    }
  `) as {
    shares: Array<{
      name: string;
      useCache: string | null;
      allocator: string | null;
      splitLevel: number | null;
      include: string | null;
      exclude: string | null;
      cacheFloor: string | null;
    }>;
  };

  return data.shares
    .filter(s => s.name)
    .map(s => ({
      name: s.name,
      use_cache: s.useCache ?? 'unknown',
      allocator: s.allocator ?? 'unknown',
      split_level: s.splitLevel ?? null,
      include: s.include ?? '',
      exclude: s.exclude ?? '',
      cache_floor: s.cacheFloor ?? '',
    }));
}

export async function getPlugins(url: string, apiKey: string): Promise<UnraidPlugin[]> {
  const data = await gql(url, apiKey, `
    query {
      plugins {
        name
        version
        status
      }
    }
  `) as {
    plugins: Array<{ name: string; version: string | null; status: string | null }>;
  };

  return data.plugins.map(p => ({
    name: p.name,
    version: p.version ?? 'unknown',
    status: p.status ?? 'unknown',
  }));
}
