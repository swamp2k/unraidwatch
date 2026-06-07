import type { SSEData } from '../../hooks/useSSE';

interface Props {
  array: SSEData['array'];
}

export function ArrayStatus({ array }: Props) {
  if (!array) return (
    <div className="card">
      <div style={{ fontWeight: 600, marginBottom: 12 }}>Array Status</div>
      <p style={{ color: 'var(--text-muted)' }}>No array data.</p>
    </div>
  );

  const usedPct = array.capacity_total_tb > 0
    ? Math.round((array.capacity_used_tb / array.capacity_total_tb) * 100)
    : 0;

  return (
    <div className="card">
      <div style={{ fontWeight: 600, marginBottom: 12 }}>Array Status</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="flex justify-between">
          <span style={{ color: 'var(--text-muted)' }}>Status</span>
          <span className={`badge badge-${array.status === 'Started' ? 'running' : 'stopped'}`}>{array.status}</span>
        </div>
        <div className="flex justify-between">
          <span style={{ color: 'var(--text-muted)' }}>Used</span>
          <span>{array.capacity_used_tb.toFixed(2)} / {array.capacity_total_tb.toFixed(2)} TB</span>
        </div>
        <div className="progress-bar">
          <div
            className={`progress-fill${usedPct >= 90 ? ' progress-danger' : usedPct >= 75 ? ' progress-warn' : ''}`}
            style={{ width: `${usedPct}%` }}
          />
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {(array.disks as unknown[]).length} disk{(array.disks as unknown[]).length !== 1 ? 's' : ''} + {(array.cache as unknown[]).length} cache
        </div>
      </div>
    </div>
  );
}
