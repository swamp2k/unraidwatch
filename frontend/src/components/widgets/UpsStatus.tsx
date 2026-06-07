import type { SSEData } from '../../hooks/useSSE';

interface Props {
  ups: SSEData['ups'];
}

export function UpsStatus({ ups }: Props) {
  if (!ups) return (
    <div className="card">
      <div style={{ fontWeight: 600, marginBottom: 12 }}>UPS</div>
      <p style={{ color: 'var(--text-muted)' }}>No UPS data.</p>
    </div>
  );

  return (
    <div className="card">
      <div style={{ fontWeight: 600, marginBottom: 12 }}>UPS — {ups.model}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="flex justify-between"><span style={{ color: 'var(--text-muted)' }}>Status</span><span>{ups.status}</span></div>
        <div className="flex justify-between"><span style={{ color: 'var(--text-muted)' }}>Battery</span><span>{ups.battery_pct}%</span></div>
        <div className="flex justify-between"><span style={{ color: 'var(--text-muted)' }}>Runtime</span><span>{ups.runtime_min} min</span></div>
        <div className="flex justify-between"><span style={{ color: 'var(--text-muted)' }}>Load</span><span>{ups.load_pct}%</span></div>
      </div>
    </div>
  );
}
