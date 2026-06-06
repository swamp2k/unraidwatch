import { useState, useMemo } from 'react';
import { TopBar } from '../components/layout/TopBar';
import { useSSE } from '../hooks/useSSE';
import { api } from '../lib/api';
import { Play, Square, RotateCcw, FileText, X } from 'lucide-react';
import { API_BASE } from '../lib/api';

type SortField = 'status' | 'name' | 'cpu' | 'ram';
type SortDir = 'asc' | 'desc';
type Container = { id: string; name: string; status: string; cpu_pct: number; mem_mb: number };

const SORT_OPTIONS: { field: SortField; label: string }[] = [
  { field: 'status', label: 'Running first' },
  { field: 'name',   label: 'Name' },
  { field: 'cpu',    label: 'CPU' },
  { field: 'ram',    label: 'RAM' },
];

function sortContainers(containers: Container[], field: SortField, dir: SortDir): Container[] {
  return [...containers].sort((a, b) => {
    let cmp = 0;
    switch (field) {
      case 'status': {
        const rank = (s: string) => s === 'running' ? 0 : 1;
        cmp = rank(a.status) - rank(b.status) || a.name.localeCompare(b.name);
        break;
      }
      case 'name': cmp = a.name.localeCompare(b.name); break;
      case 'cpu':  cmp = a.cpu_pct - b.cpu_pct; break;
      case 'ram':  cmp = a.mem_mb  - b.mem_mb;  break;
    }
    return dir === 'desc' ? -cmp : cmp;
  });
}

function fmt(n: number, unit: string) {
  return n > 0 ? `${n}${unit}` : <span style={{ color: 'var(--text-muted)' }}>—</span>;
}

export function Docker() {
  const sse = useSSE();
  const [sortField, setSortField] = useState<SortField>('status');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [runningOnly, setRunningOnly] = useState(false);
  const [logs, setLogs] = useState<{ name: string; text: string } | null>(null);
  const [actioning, setActioning] = useState<string | null>(null);
  const [logsLoading, setLogsLoading] = useState<string | null>(null);

  function setSort(field: SortField) {
    if (field === sortField) {
      // toggle direction, but "status" always desc
      setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    } else {
      setSortField(field);
      setSortDir(field === 'name' ? 'asc' : 'desc');
    }
  }

  const containers = useMemo(() => {
    const list = sse.docker ?? [];
    const filtered = runningOnly ? list.filter(c => c.status === 'running') : list;
    return sortContainers(filtered, sortField, sortDir);
  }, [sse.docker, sortField, sortDir, runningOnly]);

  const runningCount = (sse.docker ?? []).filter(c => c.status === 'running').length;
  const totalCount   = (sse.docker ?? []).length;

  async function doAction(id: string, act: 'start' | 'stop' | 'restart') {
    setActioning(`${id}-${act}`);
    try { await api.post(`/api/unraid/docker/${encodeURIComponent(id)}/${act}`); }
    finally { setActioning(null); }
  }

  async function viewLogs(id: string, name: string) {
    setLogsLoading(id);
    try {
      const text = await fetch(`${API_BASE}/api/unraid/docker/${encodeURIComponent(id)}/logs`, { credentials: 'include' }).then(r => r.text());
      setLogs({ name, text });
    } catch (e) {
      setLogs({ name, text: `Failed: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setLogsLoading(null);
    }
  }

  function SortBtn({ field, label }: { field: SortField; label: string }) {
    const active = sortField === field;
    const arrow = active ? (sortDir === 'desc' ? ' ↓' : ' ↑') : '';
    return (
      <button
        className={active ? 'btn-primary' : 'btn-ghost'}
        style={{ padding: '5px 12px', fontSize: 12 }}
        onClick={() => setSort(field)}
      >
        {label}{arrow}
      </button>
    );
  }

  return (
    <>
      <TopBar title="Docker" />
      <div className="page">

        {logs && (
          <div className="card mb-4">
            <div className="flex justify-between items-center mb-3">
              <strong style={{ fontSize: 15 }}>Logs — {logs.name}</strong>
              <button className="btn-ghost" style={{ padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => setLogs(null)}>
                <X size={14} /> Close
              </button>
            </div>
            <pre style={{ maxHeight: 420, overflowY: 'auto', fontSize: 11 }}>{logs.text}</pre>
          </div>
        )}

        <div className="card">
          {/* Toolbar */}
          <div className="flex items-center gap-2 mb-4" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Sort:</span>
            {SORT_OPTIONS.map(o => <SortBtn key={o.field} field={o.field} label={o.label} />)}

            <div style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 4px' }} />

            <button
              className={runningOnly ? 'btn-primary' : 'btn-ghost'}
              style={{ padding: '5px 12px', fontSize: 12 }}
              onClick={() => setRunningOnly(v => !v)}
            >
              Running only
            </button>

            <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)' }}>
              {runningCount}/{totalCount} running
            </span>
          </div>

          {containers.length === 0 ? (
            <div className="empty-state">
              <h3>{runningOnly ? 'No running containers' : 'No containers'}</h3>
              <p>{runningOnly ? 'All containers are stopped.' : 'No server connected or no containers found.'}</p>
            </div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Status</th>
                  <th style={{ width: 80 }}>CPU</th>
                  <th style={{ width: 90 }}>RAM</th>
                  <th style={{ width: 120 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {containers.map(c => (
                  <tr key={c.id} style={{ opacity: c.status !== 'running' ? 0.6 : 1 }}>
                    <td style={{ fontWeight: c.status === 'running' ? 500 : 400 }}>{c.name}</td>
                    <td>
                      <span className={`badge badge-${c.status === 'running' ? 'running' : 'stopped'}`}>
                        {c.status}
                      </span>
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{fmt(c.cpu_pct, '%')}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{fmt(c.mem_mb, ' MB')}</td>
                    <td>
                      <div className="flex gap-2">
                        <button className="btn-ghost" style={{ padding: '4px 8px' }} title="Start"
                          onClick={() => void doAction(c.id, 'start')}
                          disabled={actioning !== null || c.status === 'running'}>
                          <Play size={13} />
                        </button>
                        <button className="btn-ghost" style={{ padding: '4px 8px' }} title="Stop"
                          onClick={() => void doAction(c.id, 'stop')}
                          disabled={actioning !== null || c.status !== 'running'}>
                          <Square size={13} />
                        </button>
                        <button className="btn-ghost" style={{ padding: '4px 8px' }} title="Restart"
                          onClick={() => void doAction(c.id, 'restart')}
                          disabled={actioning !== null || c.status !== 'running'}>
                          <RotateCcw size={13} />
                        </button>
                        <button
                          className="btn-ghost" style={{ padding: '4px 8px', color: logsLoading === c.id ? 'var(--accent)' : undefined }}
                          title="View logs" disabled={logsLoading !== null}
                          onClick={() => void viewLogs(c.id, c.name)}>
                          <FileText size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
