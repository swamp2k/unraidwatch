import { useState, useRef, useEffect } from 'react';
import { TopBar } from '../components/layout/TopBar';
import { api } from '../lib/api';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDate } from '../lib/format';
import { Trash2, Download, X, Send, CheckCircle2, Circle, ChevronLeft, ChevronRight, RotateCcw, MessageSquare } from 'lucide-react';
import { exportInvestigation } from '../lib/export';

interface Finding {
  issue: string;
  cause: string;
  fix: string;
}

interface Investigation {
  id: string;
  problem: string;
  severity: 'ok' | 'warning' | 'critical';
  summary: string;
  root_cause: string;
  evidence: string[];
  findings: Finding[];
  data_collected: string[];
  created_at: number;
}

interface ChatMsg {
  role: 'user' | 'assistant';
  content: string;
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

// ── Checked findings persistence ──────────────────────────────────────────────

function loadChecked(invId: string | undefined): Set<number> {
  if (!invId) return new Set();
  try {
    const s = localStorage.getItem(`detective-chk-${invId}`);
    return s ? new Set(JSON.parse(s) as number[]) : new Set();
  } catch { return new Set(); }
}

function saveChecked(invId: string, checked: Set<number>) {
  localStorage.setItem(`detective-chk-${invId}`, JSON.stringify([...checked]));
}

// ── Finding overlay (drawer) ──────────────────────────────────────────────────

function FindingOverlay({
  finding, findingIndex, totalFindings, investigationContext,
  resolved, onToggleResolved, onNavigate, onClose,
}: {
  finding: Finding;
  findingIndex: number;
  totalFindings: number;
  investigationContext: string;
  resolved: boolean;
  onToggleResolved: () => void;
  onNavigate: (delta: -1 | 1) => void;
  onClose: () => void;
}) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Reset chat when finding changes
  useEffect(() => {
    setMessages([]);
    setInput('');
    setSending(false);
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [findingIndex]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && findingIndex > 0) onNavigate(-1);
      if (e.key === 'ArrowRight' && findingIndex < totalFindings - 1) onNavigate(1);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [findingIndex, totalFindings, onClose, onNavigate]);

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    const next: ChatMsg[] = [...messages, { role: 'user', content: text }];
    setMessages(next);
    setInput('');
    setSending(true);
    try {
      const { answer } = await api.post<{ answer: string }>('/api/detective/chat', {
        finding,
        messages: next,
        investigation_context: investigationContext,
      });
      setMessages(m => [...m, { role: 'assistant', content: answer }]);
    } catch (e) {
      setMessages(m => [...m, { role: 'assistant', content: `Error: ${e instanceof Error ? e.message : 'Unknown error'}` }]);
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
          zIndex: 100, animation: 'fadeIn 0.15s ease',
        }}
      />
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 520,
        background: 'var(--bg-card)', borderLeft: '1px solid var(--border)',
        zIndex: 101, display: 'flex', flexDirection: 'column',
        animation: 'slideInRight 0.2s ease',
      }}>
        {/* Header */}
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <button
              className="btn-ghost"
              style={{ padding: '4px 7px', opacity: findingIndex === 0 ? 0.3 : 1 }}
              disabled={findingIndex === 0}
              onClick={() => onNavigate(-1)}
              title="Previous finding (←)"
            >
              <ChevronLeft size={15} />
            </button>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', minWidth: 40, textAlign: 'center' }}>
              {findingIndex + 1} / {totalFindings}
            </span>
            <button
              className="btn-ghost"
              style={{ padding: '4px 7px', opacity: findingIndex === totalFindings - 1 ? 0.3 : 1 }}
              disabled={findingIndex === totalFindings - 1}
              onClick={() => onNavigate(1)}
              title="Next finding (→)"
            >
              <ChevronRight size={15} />
            </button>
          </div>
          <div style={{ flex: 1, fontWeight: 600, fontSize: 14, marginLeft: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {finding.issue}
          </div>
          <button
            onClick={onToggleResolved}
            style={{
              display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, padding: '5px 11px',
              background: resolved ? 'rgba(34,197,94,0.15)' : 'transparent',
              color: 'var(--success)',
              border: '1px solid var(--success)', borderRadius: 6, flexShrink: 0,
            }}
          >
            {resolved ? <CheckCircle2 size={13} /> : <Circle size={13} />}
            {resolved ? 'Resolved' : 'Mark resolved'}
          </button>
          <button className="btn-ghost" style={{ padding: '5px 7px', flexShrink: 0 }} onClick={onClose} title="Close (Esc)">
            <X size={15} />
          </button>
        </div>

        {/* Finding details */}
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg)', fontSize: 13 }}>
          <div style={{ color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: 4 }}>Cause</div>
          <p style={{ lineHeight: 1.55, marginBottom: 12 }}>{finding.cause}</p>
          <div style={{ color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: 4 }}>Suggested fix</div>
          <pre style={{ fontSize: 12, lineHeight: 1.55, margin: 0 }}>{finding.fix}</pre>
        </div>

        {/* Chat messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {messages.length === 0 && (
            <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', marginTop: 24, lineHeight: 1.6 }}>
              <MessageSquare size={20} style={{ opacity: 0.4, marginBottom: 8 }} />
              <div>Ask a follow-up question about this issue</div>
              <div style={{ fontSize: 11, marginTop: 4 }}>e.g. "How do I find the chapter thumbnail cache location?"</div>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: m.role === 'user' ? 'row-reverse' : 'row', alignItems: 'flex-start' }}>
              <div style={{
                maxWidth: '88%', padding: '9px 13px', borderRadius: 10, fontSize: 13, lineHeight: 1.55,
                background: m.role === 'user' ? 'var(--accent)' : 'var(--bg-hover)',
                color: m.role === 'user' ? '#fff' : 'var(--text)',
                whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                border: m.role === 'assistant' ? '1px solid var(--border)' : 'none',
              }}>
                {m.content}
              </div>
            </div>
          ))}
          {sending && (
            <div style={{ color: 'var(--text-muted)', fontSize: 12, paddingLeft: 2 }}>Thinking…</div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); }
            }}
            placeholder="Ask a follow-up question… (Enter to send, Shift+Enter for newline)"
            rows={2}
            disabled={sending}
            style={{ flex: 1, fontSize: 13, resize: 'none', lineHeight: 1.5 }}
          />
          <button
            className="btn-primary"
            onClick={() => void send()}
            disabled={sending || !input.trim()}
            style={{ padding: '8px 12px', flexShrink: 0 }}
            title="Send"
          >
            <Send size={14} />
          </button>
        </div>
      </div>
    </>
  );
}

// ── Finding card ──────────────────────────────────────────────────────────────

function FindingCard({ finding, index, checked, onToggleCheck, onOpen }: {
  finding: Finding;
  index: number;
  checked: boolean;
  onToggleCheck: (i: number) => void;
  onOpen: (i: number) => void;
}) {
  return (
    <div
      className="card"
      style={{
        display: 'flex', gap: 12, alignItems: 'flex-start', cursor: 'pointer',
        opacity: checked ? 0.55 : 1, transition: 'opacity 0.2s',
        borderLeft: checked ? '3px solid var(--success)' : '3px solid var(--border)',
      }}
      onClick={() => onOpen(index)}
    >
      {/* Checkbox */}
      <button
        onClick={e => { e.stopPropagation(); onToggleCheck(index); }}
        style={{ background: 'none', border: 'none', padding: '2px 0', flexShrink: 0, color: checked ? 'var(--success)' : 'var(--text-muted)', marginTop: 1 }}
        title={checked ? 'Mark as unresolved' : 'Mark as resolved'}
      >
        {checked ? <CheckCircle2 size={18} /> : <Circle size={18} />}
      </button>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, marginBottom: 4, textDecoration: checked ? 'line-through' : 'none' }}>{finding.issue}</div>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 0, lineHeight: 1.5 }}>{finding.cause}</p>
      </div>

      {/* Open indicator */}
      <div style={{ color: 'var(--accent)', flexShrink: 0, alignSelf: 'center', fontSize: 12, display: 'flex', alignItems: 'center', gap: 3 }}>
        <MessageSquare size={13} />
        <span>Chat</span>
      </div>
    </div>
  );
}

// ── Result card ───────────────────────────────────────────────────────────────

function ResultCard({ inv, checked, onToggleCheck, onOpen, onReassess }: {
  inv: Investigation;
  checked: Set<number>;
  onToggleCheck: (i: number) => void;
  onOpen: (i: number) => void;
  onReassess: () => void;
}) {
  const resolvedCount = checked.size;
  const totalFindings = inv.findings?.length ?? 0;

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

      {totalFindings > 0 && (
        <>
          <div style={{ fontWeight: 600, marginBottom: 10, fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Findings — click a card to drill down and chat
            {resolvedCount > 0 && (
              <span style={{ marginLeft: 8, color: 'var(--success)', fontWeight: 500 }}>
                {resolvedCount}/{totalFindings} resolved
              </span>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
            {inv.findings.map((f, i) => (
              <FindingCard
                key={i}
                finding={f}
                index={i}
                checked={checked.has(i)}
                onToggleCheck={onToggleCheck}
                onOpen={onOpen}
              />
            ))}
          </div>

          {resolvedCount > 0 && (
            <div className="card mb-4" style={{ background: 'rgba(34,197,94,0.06)', borderColor: 'rgba(34,197,94,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                {resolvedCount === totalFindings
                  ? 'All findings resolved — run a re-assessment to confirm the original problem is fixed.'
                  : `${resolvedCount} of ${totalFindings} findings resolved — re-assess to check remaining issues.`}
              </div>
              <button
                className="btn-ghost"
                style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, flexShrink: 0, color: 'var(--success)', borderColor: 'rgba(34,197,94,0.4)' }}
                onClick={onReassess}
              >
                <RotateCcw size={13} /> Re-assess
              </button>
            </div>
          )}
        </>
      )}
    </>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function Detective() {
  const qc = useQueryClient();
  const [problem, setProblem] = useState('');
  const [result, setResult] = useState<Investigation | null>(null);
  const [activeHistoryId, setActiveHistoryId] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [overlayIndex, setOverlayIndex] = useState<number | null>(null);

  const { data: history = [] } = useQuery<Investigation[]>({
    queryKey: ['detective-history'],
    queryFn: () => api.get('/api/detective/history'),
  });

  const { data: historyDetail } = useQuery<Investigation>({
    queryKey: ['detective-history', activeHistoryId],
    queryFn: () => api.get(`/api/detective/history/${activeHistoryId}`),
    enabled: !!activeHistoryId,
  });

  const activeInv = activeHistoryId ? historyDetail : result;

  // Checked findings, keyed by investigation id
  const [checkedMap, setCheckedMap] = useState<Map<string, Set<number>>>(new Map());

  function getChecked(invId: string | undefined): Set<number> {
    if (!invId) return new Set();
    if (checkedMap.has(invId)) return checkedMap.get(invId)!;
    // lazy-load from localStorage
    return loadChecked(invId);
  }

  function toggleCheck(invId: string, i: number) {
    setCheckedMap(prev => {
      const map = new Map(prev);
      const cur = map.get(invId) ?? loadChecked(invId);
      const next = new Set(cur);
      next.has(i) ? next.delete(i) : next.add(i);
      saveChecked(invId, next);
      map.set(invId, next);
      return map;
    });
  }

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

  function start(overrideProblem?: string) {
    const p = overrideProblem ?? problem;
    if (!p.trim() || investigate.isPending) return;
    const t0 = Date.now();
    const timer = setInterval(() => setElapsed(Math.round((Date.now() - t0) / 1000)), 500);
    investigate.mutateAsync(p).finally(() => { clearInterval(timer); setElapsed(0); });
  }

  function handleReassess() {
    if (!activeInv) return;
    const checked = getChecked(activeInv.id);
    const resolved = [...checked].map(i => activeInv.findings[i]?.issue).filter(Boolean);
    const unresolved = activeInv.findings
      .filter((_, i) => !checked.has(i))
      .map(f => f.issue);

    const p = [
      `Re-assess: "${activeInv.problem}".`,
      resolved.length ? `Addressed so far: ${resolved.join(', ')}.` : '',
      unresolved.length ? `Still pending: ${unresolved.join(', ')}.` : '',
      'Determine whether the original problem is fully resolved or if there are remaining/new issues.',
    ].filter(Boolean).join(' ');

    setProblem(p);
    setActiveHistoryId(null);
    setResult(null);
    start(p);
  }

  const loading = investigate.isPending;

  const investigationContext = activeInv
    ? `Problem: ${activeInv.problem}\nSummary: ${activeInv.summary}\nRoot cause: ${activeInv.root_cause}`
    : '';

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
              onClick={() => start()}
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
        {!loading && activeInv && (
          <ResultCard
            inv={activeInv}
            checked={getChecked(activeInv.id)}
            onToggleCheck={i => toggleCheck(activeInv.id, i)}
            onOpen={i => setOverlayIndex(i)}
            onReassess={handleReassess}
          />
        )}

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

      {/* Finding overlay */}
      {overlayIndex !== null && activeInv?.findings?.[overlayIndex] && (
        <FindingOverlay
          finding={activeInv.findings[overlayIndex]}
          findingIndex={overlayIndex}
          totalFindings={activeInv.findings.length}
          investigationContext={investigationContext}
          resolved={getChecked(activeInv.id).has(overlayIndex)}
          onToggleResolved={() => toggleCheck(activeInv.id, overlayIndex)}
          onNavigate={delta => setOverlayIndex(i => i !== null ? i + delta : null)}
          onClose={() => setOverlayIndex(null)}
        />
      )}
    </>
  );
}
