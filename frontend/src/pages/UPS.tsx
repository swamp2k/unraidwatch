import { TopBar } from '../components/layout/TopBar';
import { useSSE } from '../hooks/useSSE';
import { progressColor } from '../lib/format';

export function UPS() {
  const sse = useSSE();
  const ups = sse.ups;

  return (
    <>
      <TopBar title="UPS" />
      <div className="page">
        {!ups ? (
          <div className="empty-state"><h3>No UPS data</h3><p>No UPS detected or no server connected.</p></div>
        ) : (
          <div className="card" style={{ maxWidth: 480 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 20 }}>{ups.model}</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="flex justify-between">
                <span style={{ color: 'var(--text-muted)' }}>Status</span>
                <span className={`badge badge-${ups.status === 'online' ? 'running' : 'stopped'}`}>{ups.status}</span>
              </div>
              <div>
                <div className="flex justify-between mb-4"><span style={{ color: 'var(--text-muted)' }}>Battery</span><span>{ups.battery_pct}%</span></div>
                <div className="progress-bar"><div className={`progress-fill ${progressColor(100 - ups.battery_pct)}`} style={{ width: `${ups.battery_pct}%` }} /></div>
              </div>
              <div>
                <div className="flex justify-between mb-4"><span style={{ color: 'var(--text-muted)' }}>Load</span><span>{ups.load_pct}%</span></div>
                <div className="progress-bar"><div className={`progress-fill ${progressColor(ups.load_pct)}`} style={{ width: `${ups.load_pct}%` }} /></div>
              </div>
              <div className="flex justify-between">
                <span style={{ color: 'var(--text-muted)' }}>Est. runtime</span>
                <span>{ups.runtime_min} min</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
