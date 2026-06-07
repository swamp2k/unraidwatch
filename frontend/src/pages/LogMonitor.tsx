import { useState, FormEvent, KeyboardEvent } from 'react';
import { TopBar } from '../components/layout/TopBar';
import { api } from '../lib/api';
import { useSSE } from '../hooks/useSSE';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDate } from '../lib/format';
import { Trash2, Plus, ScrollText, Mail, Database, Play, X } from 'lucide-react';

const CHECK_INTERVALS = [
  { label: 'Every 1 minute',   value: 60 },
  { label: 'Every 5 minutes',  value: 300 },
  { label: 'Every 15 minutes', value: 900 },
  { label: 'Every 30 minutes', value: 1800 },
  { label: 'Every hour',       value: 3600 },
];

interface LogMonitor {
  id: string;
  name: string;
  enabled: number;
  source_type: 'syslog' | 'docker';
  source_id: string | null;
  source_label: string | null;
  keywords: string[];
  notify_email: number;
  notify_record: number;
  notify_action: number;
  action_container_id: string | null;
  action_type: string | null;
  check_interval_s: number;
  cooldown_s: number;
  last_fired_at: number | null;
}

interface MonitorEvent {
  id: string;
  monitor_type: string;
  monitor_name: string;
  detail: { keyword?: string; matched_line?: string; source?: string; total_matches?: number };
  actions_taken: string[];
  fired_at: number;
}

export function LogMonitor() {
  const qc = useQueryClient();
  const sse = useSSE();
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<LogMonitor | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [sourceType, setSourceType] = useState<'syslog' | 'docker'>('syslog');
  const [sourceId, setSourceId] = useState('');
  const [keywords, setKeywords] = useState<string[]>([]);
  const [kwInput, setKwInput] = useState('');
  const [notifyEmail, setNotifyEmail] = useState(false);
  const [notifyRecord, setNotifyRecord] = useState(true);
  const [notifyAction, setNotifyAction] = useState(false);
  const [actionContainerId, setActionContainerId] = useState('');
  const [actionType, setActionType] = useState<'start' | 'stop' | 'restart'>('restart');
  const [checkInterval, setCheckInterval] = useState(3600);
  const [cooldownMin, setCooldownMin] = useState(60);

  const { data: monitors = [] } = useQuery<LogMonitor[]>({
    queryKey: ['log-monitors'],
    queryFn: () => api.get('/api/monitors/log'),
  });

  const { data: events = [] } = useQuery<MonitorEvent[]>({
    queryKey: ['monitor-events', 'log'],
    queryFn: () => api.get('/api/monitors/events?type=log'),
  });

  function resetForm() {
    setName(''); setSourceType('syslog'); setSourceId('');
    setKeywords([]); setKwInput('');
    setNotifyEmail(false); setNotifyRecord(true); setNotifyAction(false);
    setActionContainerId(''); setActionType('restart'); setCooldownMin(60);
    setEditTarget(null); setShowForm(false);
  }

  function openEdit(m: LogMonitor) {
    setName(m.name);
    setSourceType(m.source_type);
    setSourceId(m.source_id ?? '');
    setKeywords(m.keywords);
    setNotifyEmail(!!m.notify_email);
    setNotifyRecord(!!m.notify_record);
    setNotifyAction(!!m.notify_action);
    setActionContainerId(m.action_container_id ?? '');
    setActionType((m.action_type as 'start' | 'stop' | 'restart') ?? 'restart');
    setCheckInterval(m.check_interval_s);
    setCooldownMin(m.cooldown_s / 60);
    setEditTarget(m);
    setShowForm(true);
  }

  function addKeyword() {
    const kw = kwInput.trim();
    if (kw && !keywords.includes(kw)) setKeywords(k => [...k, kw]);
    setKwInput('');
  }

  function handleKwKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addKeyword(); }
    if (e.key === 'Backspace' && !kwInput && keywords.length > 0) {
      setKeywords(k => k.slice(0, -1));
    }
  }

  const buildPayload = () => {
    const container = sourceType === 'docker' ? sse.docker?.find(c => c.id === sourceId) : null;
    return {
      name: name.trim(),
      source_type: sourceType,
      source_id: sourceType === 'docker' ? sourceId || null : null,
      source_label: container ? container.name : (sourceType === 'syslog' ? 'Syslog' : null),
      keywords,
      notify_email: notifyEmail ? 1 : 0,
      notify_record: notifyRecord ? 1 : 0,
      notify_action: notifyAction ? 1 : 0,
      action_container_id: notifyAction ? actionContainerId || null : null,
      action_type: notifyAction ? actionType : null,
      check_interval_s: checkInterval,
      cooldown_s: cooldownMin * 60,
    };
  };

  const create = useMutation({
    mutationFn: () => api.post('/api/monitors/log', buildPayload()),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['log-monitors'] }); resetForm(); },
  });

  const update = useMutation({
    mutationFn: () => api.put(`/api/monitors/log/${editTarget!.id}`, buildPayload()),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['log-monitors'] }); resetForm(); },
  });

  const toggle = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: number }) =>
      api.put(`/api/monitors/log/${id}`, { enabled }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['log-monitors'] }),
  });

  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/api/monitors/log/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['log-monitors'] }),
  });

  const delEvent = useMutation({
    mutationFn: (id: string) => api.delete(`/api/monitors/events/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['monitor-events', 'log'] }),
  });

  const containers = sse.docker ?? [];
  const isBusy = create.isPending || update.isPending;
  const submitError = create.error ?? update.error;

  return (
    <>
      <TopBar title="Log Monitor" />
      <div className="page">
        {/* Monitor Config */}
        <div className="card mb-4">
          <div className="flex justify-between items-center mb-4">
            <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
              <ScrollText size={16} /> Log Monitors
            </div>
            <button
              className="btn-primary"
              style={{ padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 6 }}
              onClick={() => { resetForm(); setShowForm(true); }}
            >
              <Plus size={14} /> Add monitor
            </button>
          </div>

          {showForm && (
            <form
              onSubmit={(e: FormEvent) => { e.preventDefault(); editTarget ? update.mutate() : create.mutate(); }}
              className="card mb-4"
              style={{ background: 'var(--bg)' }}
            >
              <div className="grid-2 mb-4">
                <div className="form-row">
                  <label>Name</label>
                  <input value={name} onChange={e => setName(e.target.value)} required placeholder="e.g. Disk errors" />
                </div>
                <div className="form-row">
                  <label>Log source</label>
                  <select value={sourceType} onChange={e => { setSourceType(e.target.value as 'syslog' | 'docker'); setSourceId(''); }}>
                    <option value="syslog">Syslog</option>
                    <option value="docker">Docker container logs</option>
                  </select>
                </div>
                {sourceType === 'docker' && (
                  <div className="form-row">
                    <label>Container</label>
                    <select value={sourceId} onChange={e => setSourceId(e.target.value)} required>
                      <option value="">— select container —</option>
                      {containers.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="form-row">
                  <label>Check every</label>
                  <select value={checkInterval} onChange={e => setCheckInterval(parseInt(e.target.value))}>
                    {CHECK_INTERVALS.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div className="form-row">
                  <label>Cooldown (min between alerts)</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                      type="number"
                      min={1}
                      value={cooldownMin}
                      onChange={e => setCooldownMin(parseInt(e.target.value))}
                      style={{ width: 80 }}
                    />
                    <span style={{ color: 'var(--text-muted)' }}>minutes</span>
                  </div>
                </div>
              </div>

              <div className="form-row mb-4">
                <label>Keywords (press Enter or comma to add)</label>
                <input
                  value={kwInput}
                  onChange={e => setKwInput(e.target.value)}
                  onKeyDown={handleKwKeyDown}
                  onBlur={addKeyword}
                  placeholder="e.g. error, CRIT, failed"
                />
                {keywords.length > 0 && (
                  <div className="keyword-chips">
                    {keywords.map(kw => (
                      <span key={kw} className="keyword-chip">
                        {kw}
                        <button
                          type="button"
                          onClick={() => setKeywords(k => k.filter(x => x !== kw))}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'inherit', display: 'flex' }}
                        >
                          <X size={10} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ marginBottom: 16 }}>
                <div style={{ fontWeight: 500, marginBottom: 8, fontSize: 13 }}>When keyword is found:</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <input type="checkbox" checked={notifyRecord} onChange={e => setNotifyRecord(e.target.checked)} />
                    <Database size={14} /> Record event for later review
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <input type="checkbox" checked={notifyEmail} onChange={e => setNotifyEmail(e.target.checked)} />
                    <Mail size={14} /> Send email notification
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <input type="checkbox" checked={notifyAction} onChange={e => setNotifyAction(e.target.checked)} />
                    <Play size={14} /> Take action on a container
                  </label>
                  {notifyAction && (
                    <div className="grid-2" style={{ marginLeft: 24 }}>
                      <div className="form-row">
                        <label>Container</label>
                        <select value={actionContainerId} onChange={e => setActionContainerId(e.target.value)} required>
                          <option value="">— select container —</option>
                          {containers.map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="form-row">
                        <label>Action</label>
                        <select value={actionType} onChange={e => setActionType(e.target.value as 'start' | 'stop' | 'restart')}>
                          <option value="start">Start</option>
                          <option value="stop">Stop</option>
                          <option value="restart">Restart</option>
                        </select>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {submitError && <p style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 8 }}>{submitError.message}</p>}
              <div className="form-actions">
                <button type="button" className="btn-ghost" onClick={resetForm}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={isBusy || !name.trim() || keywords.length === 0}>
                  {isBusy ? 'Saving…' : editTarget ? 'Update monitor' : 'Add monitor'}
                </button>
              </div>
            </form>
          )}

          {monitors.length === 0 ? (
            <p style={{ color: 'var(--text-muted)' }}>No log monitors configured. Add one above.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Source</th>
                  <th>Keywords</th>
                  <th>Notifications</th>
                  <th>Check every</th>
                  <th>Last fired</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {monitors.map(m => (
                  <tr key={m.id}>
                    <td style={{ fontWeight: 500 }}>
                      {m.name}
                      {!m.enabled && <span className="badge badge-stopped" style={{ marginLeft: 8, fontSize: 10 }}>disabled</span>}
                    </td>
                    <td style={{ fontSize: 12 }}>
                      {m.source_type === 'syslog' ? 'Syslog' : (m.source_label ?? m.source_id ?? 'Docker')}
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {m.keywords.slice(0, 3).map(kw => (
                          <span key={kw} className="keyword-chip">{kw}</span>
                        ))}
                        {m.keywords.length > 3 && (
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>+{m.keywords.length - 3} more</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {m.notify_email ? <span title="Email" style={{ color: 'var(--accent)' }}><Mail size={14} /></span> : null}
                        {m.notify_record ? <span title="Record" style={{ color: 'var(--accent)' }}><Database size={14} /></span> : null}
                        {m.notify_action ? <span title={`Action: ${m.action_type ?? ''}`} style={{ color: 'var(--accent)' }}><Play size={14} /></span> : null}
                      </div>
                    </td>
                    <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                      {CHECK_INTERVALS.find(o => o.value === m.check_interval_s)?.label ?? `${m.check_interval_s / 60}m`}
                    </td>
                    <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                      {m.last_fired_at ? formatDate(m.last_fired_at) : '—'}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button
                          className="btn-ghost"
                          style={{ padding: '4px 8px', fontSize: 12 }}
                          onClick={() => openEdit(m)}
                        >
                          Edit
                        </button>
                        <button
                          className="btn-ghost"
                          style={{ padding: '4px 8px', fontSize: 12 }}
                          onClick={() => toggle.mutate({ id: m.id, enabled: m.enabled ? 0 : 1 })}
                        >
                          {m.enabled ? 'Disable' : 'Enable'}
                        </button>
                        <button
                          className="btn-ghost"
                          style={{ padding: '4px 8px', color: 'var(--danger)' }}
                          onClick={() => del.mutate(m.id)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Events History */}
        <div className="card">
          <div style={{ fontWeight: 600, marginBottom: 12 }}>Event History</div>
          {events.length === 0 ? (
            <p style={{ color: 'var(--text-muted)' }}>No events recorded yet.</p>
          ) : (
            <table className="table">
              <thead>
                <tr><th>Time</th><th>Monitor</th><th>Source</th><th>Keyword</th><th>Matches</th><th>Actions</th><th></th></tr>
              </thead>
              <tbody>
                {events.map(ev => (
                  <tr key={ev.id}>
                    <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{formatDate(ev.fired_at)}</td>
                    <td>{ev.monitor_name}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{ev.detail.source ?? '—'}</td>
                    <td>
                      {ev.detail.keyword && <span className="keyword-chip">{ev.detail.keyword}</span>}
                    </td>
                    <td style={{ fontSize: 12 }}>{ev.detail.total_matches ?? 1}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{ev.actions_taken.join(', ')}</td>
                    <td>
                      <button
                        className="btn-ghost"
                        style={{ padding: '4px 8px', color: 'var(--danger)' }}
                        onClick={() => delEvent.mutate(ev.id)}
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
