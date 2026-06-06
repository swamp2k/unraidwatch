import { TopBar } from '../components/layout/TopBar';
import { useSSE } from '../hooks/useSSE';
import { formatUptime } from '../lib/format';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useState, useEffect, useRef } from 'react';

interface ChartPoint { time: string; cpu: number; ram: number }

export function Dashboard() {
  const sse = useSSE();
  const [history, setHistory] = useState<ChartPoint[]>([]);
  const historyRef = useRef(history);
  historyRef.current = history;

  useEffect(() => {
    if (!sse.stats) return;
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setHistory(h => [...h.slice(-29), { time: now, cpu: sse.stats!.cpu_pct, ram: sse.stats!.ram_pct }]);
  }, [sse.stats]);

  const stats = sse.stats;

  return (
    <>
      <TopBar title="Dashboard" />
      <div className="page">
        <div className="grid-4 mb-4">
          <div className="card stat-card">
            <div className="stat-value">{stats ? `${stats.cpu_pct.toFixed(1)}%` : '—'}</div>
            <div className="stat-label">CPU Usage</div>
          </div>
          <div className="card stat-card">
            <div className="stat-value">{stats ? `${stats.ram_pct}%` : '—'}</div>
            <div className="stat-label">RAM ({stats ? `${stats.ram_used_gb}/${stats.ram_total_gb} GB` : '—'})</div>
          </div>
          <div className="card stat-card">
            <div className="stat-value">{stats ? `${stats.temp_avg}°C` : '—'}</div>
            <div className="stat-label">Avg Temp</div>
          </div>
          <div className="card stat-card">
            <div className="stat-value">{stats ? formatUptime(stats.uptime_s) : '—'}</div>
            <div className="stat-label">Uptime</div>
          </div>
        </div>

        <div className="card mb-4">
          <div style={{ fontWeight: 600, marginBottom: 12 }}>CPU &amp; RAM (last 30s)</div>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={history}>
              <defs>
                <linearGradient id="cpu" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="ram" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="time" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} unit="%" />
              <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8 }} />
              <Area type="monotone" dataKey="cpu" name="CPU" stroke="#6366f1" fill="url(#cpu)" strokeWidth={2} dot={false} />
              <Area type="monotone" dataKey="ram" name="RAM" stroke="#22c55e" fill="url(#ram)" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="grid-2">
          {sse.docker && (
            <div className="card">
              <div style={{ fontWeight: 600, marginBottom: 12 }}>Docker ({sse.docker.length})</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {sse.docker.slice(0, 6).map(c => (
                  <div key={c.id} className="flex justify-between items-center">
                    <span>{c.name}</span>
                    <span className={`badge badge-${c.status === 'running' ? 'running' : 'stopped'}`}>{c.status}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {sse.ups && (
            <div className="card">
              <div style={{ fontWeight: 600, marginBottom: 12 }}>UPS — {sse.ups.model}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div className="flex justify-between"><span style={{ color: 'var(--text-muted)' }}>Status</span><span>{sse.ups.status}</span></div>
                <div className="flex justify-between"><span style={{ color: 'var(--text-muted)' }}>Battery</span><span>{sse.ups.battery_pct}%</span></div>
                <div className="flex justify-between"><span style={{ color: 'var(--text-muted)' }}>Runtime</span><span>{sse.ups.runtime_min} min</span></div>
                <div className="flex justify-between"><span style={{ color: 'var(--text-muted)' }}>Load</span><span>{sse.ups.load_pct}%</span></div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
