import { useState } from 'react';
import { TopBar } from '../components/layout/TopBar';
import { api } from '../lib/api';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDate } from '../lib/format';
import { Trash2, Download } from 'lucide-react';
import { exportInvestigation } from '../lib/export';

interface Investigation {
  id: string;
  problem: string;
  severity: 'ok' | 'warning' | 'critical';
  summary: string;
  root_cause: string;
  evidence: string[];
  findings: Array<{ issue: string; cause: string; fix: string }>;
  data_collected: string[];
  created_at: number;
}

const EXAMPLES = [
  'Plex keeps buffering on 4K content',
  'Windrose is very laggy',
  'Array rebuild seems to be taking forever',
  'Docker containers keep randomly stopping',
  'Server was running very hot last night',
];

const SEV_COLOR: Record<string, string> = {
  ok: 'var(--success)',
  warning: 'var(--warning)',
  critical: 'var(--danger)',
};

function ResultCard({ inv }: { inv: Investigation }) {
  return (
    <>
      <div className="card mb-4" style={{ borderLeft: `3px solid ${SEV_COLOR[inv.severity] ?? 'var(--border)'}` }}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className={`badge badge-${inv.severity}`}>{inv.severity}</span>
            {inv.data_collected?.length > 0 && (
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {inv.data_collected.join(' · ')}
              </span>
            )}
          </div>
          <button
            className="btn-ghost"
            style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}
            onClick={() => exportInvestigation(inv)}
          >
            <Download size={13} /> Export MD
          </button>
        </div>
        <p style={{ fontSize: 15, lineHeight: 1.6, marginBottom: 12 }}>{inv.summary}</p>
        {inv.root_cause && (
          <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '10px 14px', fontSize: 13 }}>
            <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Root cause: </span>
            {inv.root_cause}
          </div>
        )}
      </div>

      {inv.evidence?.length > 0 && (
        <div className="card mb-4">
          <div style={{ fontWeight: 600, marginBottom: 10, fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Key evidence</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {inv.evidence.map((e, i) => (
              <div key={i} style={{ fontFamily: 'monospace', fontSize: 11, background: 'var(--bg)', padding: '5px 10px', borderRadius: 6, wordBreak: 'break-all' }}>
                {e}
              </div>
            ))}
          </div>
        </div>
      )}

      {inv.findings?.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
          {inv.findings.map((f, i) => (
            <div key={i} className="card">
              <div style={{ fontWeight: 600, marginBottom: 6 }}>{f.issue}</div>
              <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 10 }}>{f.cause}</p>
              <pre style={{ fontSize: 12 }}>{f.fix}</pre>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

export function Detective() {
  const qc = useQueryClient();
  const [problem, setProblem] = useState('');
  const [result, setResult] = useState<Investigation | null>(null);
  const [activeHistoryId, setActiveHistoryId] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const { data: history = [] } = useQuery<Investigation[]>({
    queryKey: ['detective-history'],
    queryFn: () => api.get('/api/detective/history'),
  });

  const { data: historyDetail } = useQuery<Investigation>({
    queryKey: ['detective-history', activeHistoryId],
    queryFn: () => api.get(`/api/detective/history/${activeHistoryId}`),
    enabled: !!activeHistoryId,
  });

  const investigate = useMutation({
    mutationFn: (p: string) => api.post<Investigation>('/api/detective/investigate', { problem: p }),
    onSuccess: (data) => {
      setResult(data);
      setActiveHistoryId(null);
      void qc.invalidateQueries({ queryKey: ['detective-history'] });
    },
  });

  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/api/detective/history/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['detective-history'] }),
  });

  function start() {
    if (!problem.trim() || investigate.isPending) return;
    const start = Date.now();
    const timer = setInterval(() => setElapsed(Math.round((Date.now() - start) / 1000)), 500);
    investigate.mutateAsync(problem).finally(() => { clearInterval(timer); setElapsed(0); });
  }

  const displayed = activeHistoryId ? historyDetail : result;
  const loading = investigate.isPending;

  return (
    <>
      <TopBar title="AI Detective" />
      <div className="page" style={{ maxWidth: 860 }}>

        {/* Prompt */}
        <div className="card mb-4">
          <div style={{ marginBottom: 12, fontWeight: 600, fontSize: 15 }}>Describe the problem</div>
          <textarea
            value={problem}
            onChange={e => setProblem(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) start(); }}
            placeholder="e.g. Plex keeps buffering, Windrose is laggy, array rebuild seems slow…"
            rows={3}
            style={{ fontSize: 15, resize: 'vertical' }}
            disabled={loading}
          />
          <div className="flex items-center gap-2 mt-4" style={{ flexWrap: 'wrap' }}>
            <button
              className="btn-primary"
              style={{ padding: '9px 24px', fontSize: 14 }}
              disabled={loading || !problem.trim()}
              onClick={start}
            >
              {loading ? `Investigating… ${elapsed}s` : 'Investigate'}
            </button>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Ctrl+Enter</span>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {EXAMPLES.map(ex => (
                <button key={ex} className="btn-ghost" style={{ fontSize: 11, padding: '4px 10px' }}
                  onClick={() => setProblem(ex)} disabled={loading}>
                  {ex}
                </button>
              ))}
            </div>
          </div>
          {investigate.error && <p className="error-msg mt-4">{investigate.error.message}</p>}
        </div>

        {/* Loading */}
        {loading && (
          <div className="card mb-4" style={{ textAlign: 'center', padding: 48 }}>
            <div style={{ fontSize: 36, marginBottom: 16 }}>🔍</div>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Investigating…</div>
            <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
              Collecting system data and analyzing with AI — this takes 15–30 seconds
            </div>
            <div style={{ marginTop: 12, color: 'var(--text-muted)', fontSize: 12 }}>{elapsed}s elapsed</div>
          </div>
        )}

        {/* Result */}
        {!loading && displayed && <ResultCard inv={displayed} />}

        {/* History */}
        <div className="card">
          <div style={{ fontWeight: 600, marginBottom: 12 }}>History</div>
          {history.length === 0 ? (
            <p style={{ color: 'var(--text-muted)' }}>No investigations yet.</p>
          ) : (
            <table className="table">
              <thead>
                <tr><th>Date</th><th>Problem</th><th>Severity</th><th>Checked</th><th></th></tr>
              </thead>
              <tbody>
                {history.map(h => (
                  <tr
                    key={h.id}
                    style={{ cursor: 'pointer', background: activeHistoryId === h.id ? 'var(--bg-hover)' : undefined }}
                    onClick={() => { setActiveHistoryId(activeHistoryId === h.id ? null : h.id); setResult(null); }}
                  >
                    <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{formatDate(h.created_at)}</td>
                    <td style={{ fontSize: 13 }}>{h.problem}</td>
                    <td><span className={`badge badge-${h.severity}`}>{h.severity}</span></td>
                    <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>{(h.data_collected ?? []).join(', ')}</td>
                    <td onClick={e => e.stopPropagation()}>
                      <button className="btn-ghost" style={{ padding: '4px 8px', color: 'var(--danger)' }}
                        onClick={() => del.mutate(h.id)}>
                        <Trash2 size={14} />
                      </button>
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
