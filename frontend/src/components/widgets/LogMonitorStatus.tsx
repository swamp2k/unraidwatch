import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { ScrollText } from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatDate } from '../../lib/format';

interface LogMonitor {
  id: string;
  name: string;
  enabled: number;
  last_fired_at: number | null;
}

interface MonitorEvent {
  id: string;
  monitor_id: string;
  fired_at: number;
}

export function LogMonitorStatus() {
  const { data: monitors = [] } = useQuery<LogMonitor[]>({
    queryKey: ['log-monitors'],
    queryFn: () => api.get('/api/monitors/log'),
    staleTime: 30_000,
  });

  const { data: events = [] } = useQuery<MonitorEvent[]>({
    queryKey: ['monitor-events', 'log'],
    queryFn: () => api.get('/api/monitors/events?type=log'),
    staleTime: 30_000,
  });

  const last24h = Date.now() / 1000 - 86400;
  const recentCount = events.filter(e => e.fired_at > last24h).length;

  return (
    <div className="card">
      <div className="flex justify-between items-center" style={{ marginBottom: 12 }}>
        <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
          <ScrollText size={14} /> Log Monitor
        </div>
        <Link to="/monitors/log" style={{ fontSize: 12, color: 'var(--accent)' }}>Configure</Link>
      </div>
      {monitors.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No log monitors configured.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
            {recentCount} event{recentCount !== 1 ? 's' : ''} in the last 24h
          </div>
          {monitors.filter(m => m.enabled).map(m => (
            <div key={m.id} className="flex justify-between items-center">
              <span style={{ fontSize: 13 }}>{m.name}</span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {m.last_fired_at ? formatDate(m.last_fired_at) : 'never'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
