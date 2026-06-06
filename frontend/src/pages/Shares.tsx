import { TopBar } from '../components/layout/TopBar';
import { useSSE } from '../hooks/useSSE';
import { progressColor } from '../lib/format';

export function Shares() {
  const sse = useSSE();
  const shares = sse.shares ?? [];

  return (
    <>
      <TopBar title="Shares" />
      <div className="page">
        {shares.length === 0 ? (
          <div className="empty-state"><h3>No shares</h3><p>No shares found on the server.</p></div>
        ) : (
          <div className="grid-3">
            {shares.map(s => (
              <div key={s.name} className="card">
                <div className="flex justify-between items-center mb-4">
                  <strong>{s.name}</strong>
                  <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{s.used_gb} / {s.total_gb} GB</span>
                </div>
                <div className="progress-bar">
                  <div className={`progress-fill ${progressColor(s.pct)}`} style={{ width: `${s.pct}%` }} />
                </div>
                <div style={{ textAlign: 'right', marginTop: 6, fontSize: 12, color: 'var(--text-muted)' }}>{s.pct}%</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
