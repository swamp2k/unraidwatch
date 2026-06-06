import { useState } from 'react';
import { TopBar } from '../components/layout/TopBar';
import { api } from '../lib/api';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDate } from '../lib/format';
import { Trash2, Zap, FileText, Download } from 'lucide-react';
import { exportAnalysis } from '../lib/export';

interface Analysis {
  id: string;
  source: string;
  provider: string;
  model: string;
  severity: 'ok' | 'warning' | 'critical';
  summary: string;
  findings: Array<{ issue: string; cause: string; fix: string }>;
  log_excerpt: string;
  line_count?: number;
  created_at: number;
}

const HOURS = [1, 6, 12, 24, 48] as const;

function SeverityBadge({ s }: { s: string }) {
  return <span className={`badge badge-${s}`}>{s}</span>;
}

function AnalysisResult({ result }: { result: Analysis }) {
  return (
    <>
      <div className="flex justify-between items-center mb-4">
        <SeverityBadge s={result.severity} />
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {result.model} · {result.provider}
          {result.line_count !== undefined && ` · ${result.line_count} lines`}
        </span>
      </div>
      <p style={{ marginBottom: 16, lineHeight: 1.6 }}>{result.summary}</p>
      {result.findings?.length > 0
        ? result.findings.map((f, i) => (
          <div key={i} className="card mb-4" style={{ background: 'var(--bg)' }}>
            <strong>{f.issue}</strong>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: '6px 0' }}>{f.cause}</p>
            <pre style={{ fontSize: 12 }}>{f.fix}</pre>
          </div>
        ))
        : <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No issues found.</p>
      }
    </>
  );
}

export function AIAnalysis() {
  const qc = useQueryClient();
  const [activeResult, setActiveResult] = useState<Analysis | null>(null);
  const [activeHistoryId, setActiveHistoryId] = useState<string | null>(null);

  // Quick syslog analysis state
  const [selectedHours, setSelectedHours] = useState<number>(6);

  // Manual paste state
  const [manualSource, setManualSource] = useState('manual');
  const [manualText, setManualText] = useState('');

  const { data: history = [] } = useQuery<Analysis[]>({
    queryKey: ['ai-history'],
    queryFn: () => api.get('/api/ai/history'),
  });

  const { data: historyDetail } = useQuery<Analysis>({
    queryKey: ['ai-history', activeHistoryId],
    queryFn: () => api.get(`/api/ai/history/${activeHistoryId}`),
    enabled: !!activeHistoryId,
  });

  const quickAnalyze = useMutation({
    mutationFn: (hours: number) =>
      api.post<Analysis>('/api/ai/analyze', { source: 'syslog', hours }),
    onSuccess: (data) => {
      setActiveResult(data);
      setActiveHistoryId(null);
      void qc.invalidateQueries({ queryKey: ['ai-history'] });
    },
  });

  const manualAnalyze = useMutation({
    mutationFn: () =>
      api.post<Analysis>('/api/ai/analyze', { source: manualSource, log_text: manualText }),
    onSuccess: (data) => {
      setActiveResult(data);
      setActiveHistoryId(null);
      void qc.invalidateQueries({ queryKey: ['ai-history'] });
    },
  });

  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/api/ai/history/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['ai-history'] }),
  });

  const displayed = activeHistoryId ? historyDetail : activeResult;
  const isRunning = quickAnalyze.isPending || manualAnalyze.isPending;

  return (
    <>
      <TopBar title="AI Syslog" />
      <div className="page">

        {/* Quick Syslog Analysis */}
        <div className="card mb-4">
          <div className="flex items-center gap-2 mb-4" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
            <Zap size={16} style={{ color: 'var(--accent)' }} />
            <span style={{ fontWeight: 600 }}>Quick Syslog Analysis</span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 4 }}>
              — fetches from your server and analyzes in one click
            </span>
          </div>
          <div className="flex items-center gap-2" style={{ flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, color: 'var(--text-muted)', marginRight: 4 }}>Last</span>
            {HOURS.map(h => (
              <button
                key={h}
                className={selectedHours === h ? 'btn-primary' : 'btn-ghost'}
                style={{ padding: '6px 14px', fontSize: 13 }}
                onClick={() => setSelectedHours(h)}
              >
                {h}h
              </button>
            ))}
            <button
              className="btn-primary"
              style={{ marginLeft: 8, display: 'flex', alignItems: 'center', gap: 6 }}
              disabled={isRunning}
              onClick={() => quickAnalyze.mutate(selectedHours)}
            >
              <Zap size={14} />
              {quickAnalyze.isPending ? 'Analyzing…' : 'Analyze'}
            </button>
          </div>
          {quickAnalyze.error && (
            <p className="error-msg mt-4">{quickAnalyze.error.message}</p>
          )}
        </div>

        <div className="grid-2 mb-4" style={{ alignItems: 'start' }}>
          {/* Manual paste */}
          <div className="card">
            <div className="flex items-center gap-2 mb-4" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
              <FileText size={16} style={{ color: 'var(--text-muted)' }} />
              <span style={{ fontWeight: 600 }}>Manual Paste</span>
            </div>
            <div className="form-row">
              <label>Source label</label>
              <input value={manualSource} onChange={e => setManualSource(e.target.value)} placeholder="e.g. docker:plex" />
            </div>
            <div className="form-row">
              <label>Log text</label>
              <textarea value={manualText} onChange={e => setManualText(e.target.value)} rows={8} placeholder="Paste log lines here…" />
            </div>
            <button
              className="btn-primary w-full"
              onClick={() => manualAnalyze.mutate()}
              disabled={isRunning || !manualText.trim()}
            >
              {manualAnalyze.isPending ? 'Analyzing…' : 'Analyze'}
            </button>
            {manualAnalyze.error && <p className="error-msg mt-4">{manualAnalyze.error.message}</p>}
          </div>

          {/* Result pane */}
          <div className="card">
            {isRunning ? (
              <div className="empty-state">
                <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
                <h3>Fetching &amp; analyzing…</h3>
                <p style={{ marginTop: 6, fontSize: 13 }}>
                  {quickAnalyze.isPending
                    ? `Collecting syslog for the last ${selectedHours}h and sending to AI`
                    : 'Sending to AI'}
                </p>
              </div>
            ) : displayed ? (
              <>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
                  <button
                    className="btn-ghost"
                    style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}
                    onClick={() => exportAnalysis(displayed)}
                  >
                    <Download size={13} /> Export MD
                  </button>
                </div>
                <AnalysisResult result={displayed} />
              </>
            ) : (
              <div className="empty-state">
                <h3>No analysis yet</h3>
                <p>Use Quick Analysis or paste a log to get started.</p>
              </div>
            )}
          </div>
        </div>

        {/* History */}
        <div className="card">
          <div style={{ fontWeight: 600, marginBottom: 12 }}>History</div>
          {history.length === 0 ? (
            <p style={{ color: 'var(--text-muted)' }}>No analyses yet.</p>
          ) : (
            <table className="table">
              <thead>
                <tr><th>Date</th><th>Source</th><th>Severity</th><th>Summary</th><th></th></tr>
              </thead>
              <tbody>
                {history.map(h => (
                  <tr
                    key={h.id}
                    style={{ cursor: 'pointer', background: activeHistoryId === h.id ? 'var(--bg-hover)' : undefined }}
                    onClick={() => { setActiveHistoryId(activeHistoryId === h.id ? null : h.id); setActiveResult(null); }}
                  >
                    <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{formatDate(h.created_at)}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{h.source}</td>
                    <td><SeverityBadge s={h.severity} /></td>
                    <td style={{ fontSize: 13, color: 'var(--text-muted)', maxWidth: 300 }}>
                      {h.summary.slice(0, 90)}{h.summary.length > 90 ? '…' : ''}
                    </td>
                    <td onClick={e => e.stopPropagation()}>
                      <button
                        className="btn-ghost"
                        style={{ padding: '4px 8px', color: 'var(--danger)' }}
                        onClick={() => del.mutate(h.id)}
                      >
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
