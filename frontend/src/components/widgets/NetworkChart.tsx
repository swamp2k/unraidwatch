import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { api } from '../../lib/api';
import { formatKbps } from '../../lib/format';

interface NetPoint { ts?: number; time: string; rx: number; tx: number }
interface ApiPoint { ts: number; net_rx_kbps: number; net_tx_kbps: number }

interface Props {
  liveHistory: NetPoint[];
}

const LIVE_WINDOWS = [
  { label: '2m',  points: 24  },
  { label: '5m',  points: 60  },
  { label: '15m', points: 180 },
  { label: '30m', points: 360 },
] as const;

const HIST_WINDOWS = ['1h', '6h', '24h', '7d'] as const;
type HistWindow = typeof HIST_WINDOWS[number];
type Window = typeof LIVE_WINDOWS[number]['label'] | HistWindow;

const ALL_WINDOWS: Window[] = ['2m', '5m', '15m', '30m', '1h', '6h', '24h', '7d'];
const HIST_WINDOW_SECONDS: Record<HistWindow, number> = {
  '1h': 3600,
  '6h': 21600,
  '24h': 86400,
  '7d': 604800,
};

const LIVE_WINDOW_SECONDS: Record<typeof LIVE_WINDOWS[number]['label'], number> = {
  '2m': 120, '5m': 300, '15m': 900, '30m': 1800,
};

function formatTs(ts: number, window: HistWindow): string {
  const d = new Date(ts * 1000);
  if (window === '7d') {
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) +
      ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatTooltip(v: number) {
  return formatKbps(v);
}

export function NetworkChart({ liveHistory }: Props) {
  const [window, setWindow] = useState<Window>('1h');

  const isLongHistorical = window === '6h' || window === '24h' || window === '7d';

  // Always fetch 1h DB data — baseline for the 1h view and live-window supplements
  const { data: hourData, isLoading: hourLoading } = useQuery<ApiPoint[]>({
    queryKey: ['metrics-history', '1h'],
    queryFn: () => api.get<ApiPoint[]>('/api/metrics/history?window=1h'),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  // For 6h / 24h / 7d fetch their specific bucket sizes
  const { data: longData, isLoading: longLoading } = useQuery<ApiPoint[]>({
    queryKey: ['metrics-history', window],
    queryFn: () => api.get<ApiPoint[]>(`/api/metrics/history?window=${window}`),
    enabled: isLongHistorical,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const isLoading = isLongHistorical ? longLoading : hourLoading;

  let displayData: NetPoint[];

  if (isLongHistorical) {
    // 6h / 24h / 7d — pure DB data, no live merge
    const histWindow = window as HistWindow;
    displayData = (longData ?? []).map(p => ({
      ts: p.ts,
      time: formatTs(p.ts, histWindow),
      rx: p.net_rx_kbps,
      tx: p.net_tx_kbps,
    }));
  } else if (window === '1h') {
    // 1h — DB is the backbone; live data fills only the current-minute gap
    const points = new Map<number, NetPoint>();
    const lastDbTs = hourData && hourData.length > 0
      ? Math.max(...hourData.map(p => p.ts))
      : 0;

    for (const p of hourData ?? []) {
      points.set(p.ts, { ts: p.ts, time: formatTs(p.ts, '1h'), rx: p.net_rx_kbps, tx: p.net_tx_kbps });
    }
    // Only add live points strictly newer than the last DB bucket
    for (const p of liveHistory) {
      if (p.ts === undefined || p.ts <= lastDbTs) continue;
      points.set(p.ts, p);
    }
    displayData = [...points.entries()].sort(([a], [b]) => a - b).map(([, p]) => p);
  } else {
    // Live windows — use SSE buffer when full; backfill from DB when buffer is short
    const liveWindow = LIVE_WINDOWS.find(w => w.label === window)!;
    const liveSlice = liveHistory.slice(-liveWindow.points);

    if (liveSlice.length >= liveWindow.points) {
      displayData = liveSlice;
    } else {
      const windowSeconds = LIVE_WINDOW_SECONDS[window as typeof LIVE_WINDOWS[number]['label']];
      const cutoff = Math.floor(Date.now() / 1000) - windowSeconds;
      const oldestLiveTs = liveSlice.length > 0 ? (liveSlice[0].ts ?? Infinity) : Infinity;

      const points = new Map<number, NetPoint>();
      for (const p of hourData ?? []) {
        if (p.ts < cutoff || p.ts >= oldestLiveTs) continue;
        points.set(p.ts, { ts: p.ts, time: formatTs(p.ts, '1h'), rx: p.net_rx_kbps, tx: p.net_tx_kbps });
      }
      for (const p of liveSlice) {
        if (p.ts === undefined) continue;
        points.set(p.ts, p);
      }
      displayData = [...points.entries()].sort(([a], [b]) => a - b).map(([, p]) => p);
    }
  }

  const tickInterval = Math.max(1, Math.floor(displayData.length / 6));
  const noData = isLoading ? 'Loading…' : 'Collecting data…';

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <span style={{ fontWeight: 600, fontSize: 14 }}>Network</span>
        <div className="flex gap-1">
          {ALL_WINDOWS.map(w => (
            <button
              key={w}
              onClick={() => setWindow(w)}
              className={window === w ? 'btn-primary' : 'btn-ghost'}
              style={{ padding: '3px 10px', fontSize: 11 }}
            >
              {w}
            </button>
          ))}
        </div>
      </div>

      {displayData.length < 2 ? (
        <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13, textAlign: 'center' }}>
          {noData}
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart data={displayData} margin={{ top: 4, right: 4, bottom: 0, left: -8 }}>
            <defs>
              <linearGradient id="gRx" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#06b6d4" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gTx" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#f59e0b" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="time"
              tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
              interval={tickInterval}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => formatKbps(v)}
              width={60}
            />
            <Tooltip
              contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
              formatter={formatTooltip}
            />
            <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
            <Area type="monotone" dataKey="rx" name="Download" stroke="#06b6d4" fill="url(#gRx)" strokeWidth={2} dot={false} />
            <Area type="monotone" dataKey="tx" name="Upload" stroke="#f59e0b" fill="url(#gTx)" strokeWidth={2} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
