import type { SSEData } from '../../hooks/useSSE';

interface Props {
  containers: SSEData['docker'];
}

export function DockerOverview({ containers }: Props) {
  if (!containers) return (
    <div className="card">
      <div style={{ fontWeight: 600, marginBottom: 12 }}>Docker</div>
      <p style={{ color: 'var(--text-muted)' }}>No data yet.</p>
    </div>
  );

  const running = containers.filter(c => c.status === 'running').length;

  return (
    <div className="card">
      <div style={{ fontWeight: 600, marginBottom: 12 }}>
        Docker ({running}/{containers.length} running)
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {containers.slice(0, 6).map(c => (
          <div key={c.id} className="flex justify-between items-center">
            <span>{c.name}</span>
            <span className={`badge badge-${c.status === 'running' ? 'running' : 'stopped'}`}>{c.status}</span>
          </div>
        ))}
        {containers.length > 6 && (
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>+{containers.length - 6} more</div>
        )}
      </div>
    </div>
  );
}
