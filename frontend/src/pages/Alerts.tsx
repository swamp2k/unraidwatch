import { useState, FormEvent } from 'react';
import { TopBar } from '../components/layout/TopBar';
import { api } from '../lib/api';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDate } from '../lib/format';
import { Trash2, Plus } from 'lucide-react';

interface AlertRule {
  id: string;
  name: string;
  metric: string;
  operator: string;
  threshold: string;
  enabled: number;
}
interface AlertHistory {
  id: string;
  rule_name: string;
  metric: string;
  value: string;
  severity: string;
  fired_at: number;
}

const METRICS = ['cpu_pct', 'ram_pct', 'disk_temp', 'ups_battery_pct', 'container_stopped'];
const OPERATORS = [{ v: 'gt', l: '>' }, { v: 'lt', l: '<' }, { v: 'eq', l: '=' }, { v: 'contains', l: 'contains' }];

export function Alerts() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [metric, setMetric] = useState('cpu_pct');
  const [operator, setOperator] = useState('gt');
  const [threshold, setThreshold] = useState('');

  const { data: rules = [] } = useQuery<AlertRule[]>({ queryKey: ['alert-rules'], queryFn: () => api.get('/api/alerts/rules') });
  const { data: history = [] } = useQuery<AlertHistory[]>({ queryKey: ['alert-history'], queryFn: () => api.get('/api/alerts/history') });

  const create = useMutation({
    mutationFn: () => api.post('/api/alerts/rules', { name, metric, operator, threshold }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['alert-rules'] }); setShowForm(false); setName(''); setThreshold(''); },
  });

  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/api/alerts/rules/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['alert-rules'] }),
  });

  return (
    <>
      <TopBar title="Alerts" />
      <div className="page">
        <div className="card mb-4">
          <div className="flex justify-between items-center mb-4">
            <div style={{ fontWeight: 600 }}>Alert Rules</div>
            <button className="btn-primary" style={{ padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => setShowForm(s => !s)}>
              <Plus size={14} /> New rule
            </button>
          </div>

          {showForm && (
            <form onSubmit={(e: FormEvent) => { e.preventDefault(); create.mutate(); }} className="card mb-4" style={{ background: 'var(--bg)' }}>
              <div className="grid-2 mb-4">
                <div className="form-row"><label>Name</label><input value={name} onChange={e => setName(e.target.value)} required /></div>
                <div className="form-row"><label>Metric</label><select value={metric} onChange={e => setMetric(e.target.value)}>{METRICS.map(m => <option key={m}>{m}</option>)}</select></div>
                <div className="form-row"><label>Operator</label><select value={operator} onChange={e => setOperator(e.target.value)}>{OPERATORS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}</select></div>
                <div className="form-row"><label>Threshold</label><input value={threshold} onChange={e => setThreshold(e.target.value)} required /></div>
              </div>
              <div className="form-actions"><button type="submit" className="btn-primary">Create rule</button></div>
            </form>
          )}

          {rules.length === 0 ? <p style={{ color: 'var(--text-muted)' }}>No rules yet.</p> : (
            <table className="table">
              <thead><tr><th>Name</th><th>Condition</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {rules.map(r => (
                  <tr key={r.id}>
                    <td>{r.name}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{r.metric} {r.operator} {r.threshold}</td>
                    <td><span className={`badge badge-${r.enabled ? 'running' : 'stopped'}`}>{r.enabled ? 'enabled' : 'disabled'}</span></td>
                    <td><button className="btn-ghost" style={{ padding: '4px 8px', color: 'var(--danger)' }} onClick={() => del.mutate(r.id)}><Trash2 size={14} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card">
          <div style={{ fontWeight: 600, marginBottom: 12 }}>Recent Firings</div>
          {history.length === 0 ? <p style={{ color: 'var(--text-muted)' }}>No alerts fired.</p> : (
            <table className="table">
              <thead><tr><th>Time</th><th>Rule</th><th>Metric</th><th>Value</th><th>Severity</th></tr></thead>
              <tbody>
                {history.map(h => (
                  <tr key={h.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{formatDate(h.fired_at)}</td>
                    <td>{h.rule_name}</td>
                    <td>{h.metric}</td>
                    <td>{h.value}</td>
                    <td><span className={`badge badge-${h.severity}`}>{h.severity}</span></td>
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
