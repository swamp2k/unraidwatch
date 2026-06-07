import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { Link } from 'react-router-dom';
import { formatDate } from '../../lib/format';

interface AlertHistory {
  id: string;
  rule_name: string;
  severity: string;
  fired_at: number;
}

export function RecentAlerts() {
  const { data: history = [] } = useQuery<AlertHistory[]>({
    queryKey: ['alert-history'],
    queryFn: () => api.get('/api/alerts/history'),
    staleTime: 60_000,
  });

  const recent = history.slice(0, 5);

  return (
    <div className="card">
      <div className="flex justify-between items-center" style={{ marginBottom: 12 }}>
        <div style={{ fontWeight: 600 }}>Recent Alerts</div>
        <Link to="/alerts" style={{ fontSize: 12, color: 'var(--accent)' }}>View all</Link>
      </div>
      {recent.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No alerts fired recently.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {recent.map(a => (
            <div key={a.id} className="flex justify-between items-center">
              <span style={{ fontSize: 13 }}>{a.rule_name}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className={`badge badge-${a.severity}`}>{a.severity}</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{formatDate(a.fired_at)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
