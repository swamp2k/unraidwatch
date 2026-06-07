import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useSSE } from '../../hooks/useSSE';
import { Activity } from 'lucide-react';
import { Link } from 'react-router-dom';

interface DockerMonitor {
  id: string;
  container_id: string;
  container_name: string;
  enabled: number;
  last_status: string | null;
  last_fired_at: number | null;
}

export function DockerMonitorStatus() {
  const sse = useSSE();
  const { data: monitors = [] } = useQuery<DockerMonitor[]>({
    queryKey: ['docker-monitors'],
    queryFn: () => api.get('/api/monitors/docker'),
    staleTime: 30_000,
  });

  // Build a live status map from SSE data
  const liveStatus = new Map<string, string>(
    (sse.docker ?? []).map(c => [c.id, c.status])
  );

  return (
    <div className="card">
      <div className="flex justify-between items-center" style={{ marginBottom: 12 }}>
        <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Activity size={14} /> Docker Monitor
        </div>
        <Link to="/monitors/docker" style={{ fontSize: 12, color: 'var(--accent)' }}>Configure</Link>
      </div>
      {monitors.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No containers being monitored.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {monitors.filter(m => m.enabled).map(m => {
            const status = liveStatus.get(m.container_id) ?? m.last_status ?? 'unknown';
            return (
              <div key={m.id} className="flex justify-between items-center">
                <span style={{ fontSize: 13 }}>{m.container_name}</span>
                <span className={`badge badge-${status === 'running' ? 'running' : 'stopped'}`}>
                  {status}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
