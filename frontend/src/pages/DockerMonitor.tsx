import { useState, FormEvent } from 'react';
import { TopBar } from '../components/layout/TopBar';
import { api } from '../lib/api';
import { useSSE } from '../hooks/useSSE';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDate } from '../lib/format';
import { Trash2, Plus, Activity, Mail, Database, Play, Power } from 'lucide-react';

interface DockerMonitor {
  id: string;
  container_id: string;
  container_name: string;
  enabled: number;
  notify_email: number;
  notify_record: number;
  notify_action: number;
  action_type: string | null;
  cooldown_s: number;
  last_fired_at: number | null;
  last_status: string | null;
}

interface MonitorEvent {
  id: string;
  monitor_type: string;
  monitor_id: string;
  monitor_name: string;
  detail: { status?: string; container_name?: string; keyword?: string; matched_line?: string };
  actions_taken: string[];
  fired_at: number;
}

export function DockerMonitor() {
  const qc = useQueryClient();
  const sse = useSSE();
  const [showForm, setShowForm] = useState(false);
  const [selectedContainer, setSelectedContainer] = useState('');
  const [notifyEmail, setNotifyEmail] = useState(false);
  const [notifyRecord, setNotifyRecord] = useState(true);
  const [notifyAction, setNotifyAction] = useState(false);
  const [actionType, setActionType] = useState<'start' | 'stop' | 'restart'>('start');
  const [cooldownMin, setCooldownMin] = useState(60);

  const { data: monitors = [] } = useQuery<DockerMonitor[]>({
    queryKey: ['docker-monitors'],
    queryFn: () => api.get('/api/monitors/docker'),
  });

  const { data: events = [] } = useQuery<MonitorEvent[]>({
    queryKey: ['monitor-events', 'docker'],
    queryFn: () => api.get('/api/monitors/events?type=docker'),
  });

  const create = useMutation({
    mutationFn: () => {
      const container = sse.docker?.find(c => c.id === selectedContainer);
      if (!container) throw new Error('No container selected');
      return api.post('/api/monitors/docker', {
        container_id: selectedContainer,
        container_name: container.name,
        notify_email: notifyEmail ? 1 : 0,
        notify_record: notifyRecord ? 1 : 0,
        notify_action: notifyAction ? 1 : 0,
        action_type: notifyAction ? actionType : null,
        cooldown_s: cooldownMin * 60,
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['docker-monitors'] });
      setShowForm(false);
      setSelectedContainer('');
      setNotifyEmail(false);
      setNotifyRecord(true);
      setNotifyAction(false);
    },
  });

  const toggle = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: number }) =>
      api.put(`/api/monitors/docker/${id}`, { enabled }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['docker-monitors'] }),
  });

  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/api/monitors/docker/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['docker-monitors'] }),
  });

  const delEvent = useMutation({
    mutationFn: (id: string) => api.delete(`/api/monitors/events/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['monitor-events', 'docker'] }),
  });

  const containers = sse.docker ?? [];
  const watchedIds = new Set(monitors.map(m => m.container_id));
  const liveStatus = new Map<string, string>(containers.map(c => [c.id, c.status]));

  return (
    <>
      <TopBar title="Docker Monitor" />
      <div className="page">
        {/* Monitor Config */}
        <div className="card mb-4">
          <div className="flex justify-between items-center mb-4">
            <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Activity size={16} /> Watched Containers
            </div>
            <button
              className="btn-primary"
              style={{ padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 6 }}
              onClick={() => setShowForm(s => !s)}
            >
              <Plus size={14} /> Add monitor
            </button>
          </div>

          {showForm && (
            <form
              onSubmit={(e: FormEvent) => { e.preventDefault(); create.mutate(); }}
              className="card mb-4"
              style={{ background: 'var(--bg)' }}
            >
              <div className="grid-2 mb-4">
                <div className="form-row">
                  <label>Container</label>
                  <select value={selectedContainer} onChange={e => setSelectedContainer(e.target.value)} required>
                    <option value="">— select container —</option>
                    {containers.filter(c => !watchedIds.has(c.id)).map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div className="form-row">
                  <label>Cooldown</label>
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

              <div style={{ marginBottom: 16 }}>
                <div style={{ fontWeight: 500, marginBottom: 8, fontSize: 13 }}>When container goes down:</div>
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
                    <Play size={14} /> Take action on container
                  </label>
                  {notifyAction && (
                    <div className="form-row" style={{ marginLeft: 24 }}>
                      <label>Action</label>
                      <select value={actionType} onChange={e => setActionType(e.target.value as 'start' | 'stop' | 'restart')}>
                        <option value="start">Start</option>
                        <option value="stop">Stop</option>
                        <option value="restart">Restart</option>
                      </select>
                    </div>
                  )}
                </div>
              </div>

              {create.error && <p style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 8 }}>{create.error.message}</p>}
              <div className="form-actions">
                <button type="button" className="btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={create.isPending || !selectedContainer}>
                  {create.isPending ? 'Adding…' : 'Add monitor'}
                </button>
              </div>
            </form>
          )}

          {monitors.length === 0 ? (
            <p style={{ color: 'var(--text-muted)' }}>No containers being monitored. Add one above.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Container</th>
                  <th>Status</th>
                  <th>Notifications</th>
                  <th>Last fired</th>
                  <th>Cooldown</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {monitors.map(m => (
                  <tr key={m.id}>
                    <td style={{ fontWeight: 500 }}>{m.container_name}</td>
                    <td>
                      {(() => {
                        const status = liveStatus.get(m.container_id) ?? m.last_status ?? 'unknown';
                        return (
                          <span className={`badge badge-${status === 'running' ? 'running' : 'stopped'}`}>
                            {status}
                          </span>
                        );
                      })()}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {m.notify_email ? <span title="Email" style={{ color: 'var(--accent)' }}><Mail size={14} /></span> : null}
                        {m.notify_record ? <span title="Record" style={{ color: 'var(--accent)' }}><Database size={14} /></span> : null}
                        {m.notify_action ? <span title={`Action: ${m.action_type ?? ''}`} style={{ color: 'var(--accent)' }}><Power size={14} /></span> : null}
                      </div>
                    </td>
                    <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                      {m.last_fired_at ? formatDate(m.last_fired_at) : '—'}
                    </td>
                    <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                      {m.cooldown_s / 60}m
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
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
                <tr><th>Time</th><th>Container</th><th>Status</th><th>Actions taken</th><th></th></tr>
              </thead>
              <tbody>
                {events.map(ev => (
                  <tr key={ev.id}>
                    <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{formatDate(ev.fired_at)}</td>
                    <td>{ev.monitor_name}</td>
                    <td>
                      <span className="badge badge-stopped">{ev.detail.status ?? 'down'}</span>
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {ev.actions_taken.join(', ')}
                    </td>
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
