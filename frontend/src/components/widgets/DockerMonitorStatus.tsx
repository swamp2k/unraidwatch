import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { Activity } from 'lucide-react';
import { Link } from 'react-router-dom';

interface DockerMonitor {
  id: string;
  container_name: string;
  enabled: number;
  last_status: string | null;
  last_fired_at: number | null;
}

export function DockerMonitorStatus() {
  const { data: monitors = [] } = useQuery<DockerMonitor[]>({
    queryKey: ['docker-monitors'],
    queryFn: () => api.get('/api/monitors/docker'),
    staleTime: 30_000,
  });

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
          {monitors.filter(m => m.enabled).map(m => (
            <div key={m.id} className="flex justify-between items-center">
              <span style={{ fontSize: 13 }}>{m.container_name}</span>
              <span className={`badge badge-${m.last_status === 'running' ? 'running' : 'stopped'}`}>
                {m.last_status ?? 'unknown'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
