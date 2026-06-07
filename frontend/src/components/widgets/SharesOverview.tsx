import type { SSEData } from '../../hooks/useSSE';

interface Props {
  shares: SSEData['shares'];
}

export function SharesOverview({ shares }: Props) {
  if (!shares || shares.length === 0) return (
    <div className="card">
      <div style={{ fontWeight: 600, marginBottom: 12 }}>Shares</div>
      <p style={{ color: 'var(--text-muted)' }}>No shares data.</p>
    </div>
  );

  return (
    <div className="card">
      <div style={{ fontWeight: 600, marginBottom: 12 }}>Shares ({shares.length})</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {shares.slice(0, 5).map(s => (
          <div key={s.name}>
            <div className="flex justify-between" style={{ marginBottom: 4, fontSize: 13 }}>
              <span>{s.name}</span>
              <span style={{ color: 'var(--text-muted)' }}>{s.used_gb.toFixed(1)} / {s.total_gb.toFixed(1)} GB</span>
            </div>
            <div className="progress-bar">
              <div
                className={`progress-fill${s.pct >= 90 ? ' progress-danger' : s.pct >= 75 ? ' progress-warn' : ''}`}
                style={{ width: `${s.pct}%` }}
              />
            </div>
          </div>
        ))}
        {shares.length > 5 && (
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>+{shares.length - 5} more shares</div>
        )}
      </div>
    </div>
  );
}
