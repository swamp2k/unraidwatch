import { formatUptime } from '../../lib/format';
import type { SSEData } from '../../hooks/useSSE';

interface Props {
  stats: SSEData['stats'];
}

export function StatsCards({ stats }: Props) {
  return (
    <div className="grid-4">
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
  );
}
