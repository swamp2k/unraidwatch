import { useState, FormEvent } from 'react';
import { TopBar } from '../components/layout/TopBar';
import { api } from '../lib/api';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDate } from '../lib/format';
import { Trash2, UserPlus } from 'lucide-react';

interface Invite {
  id: string;
  email: string;
  used_at: number | null;
  expires_at: number;
}

export function AdminInvites() {
  const qc = useQueryClient();
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState('');

  const { data: invites = [] } = useQuery<Invite[]>({ queryKey: ['invites'], queryFn: () => api.get('/api/admin/invites') });

  const create = useMutation({
    mutationFn: () => api.post('/api/admin/invites', { email }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['invites'] }); setEmail(''); setMsg('Invite sent!'); },
  });

  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/api/admin/invites/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['invites'] }),
  });

  return (
    <>
      <TopBar title="Admin — Invites" />
      <div className="page">
        <div className="card mb-4" style={{ maxWidth: 480 }}>
          <h3 style={{ fontWeight: 600, marginBottom: 12 }}>Invite new user</h3>
          <form onSubmit={(e: FormEvent) => { e.preventDefault(); create.mutate(); }}>
            <div className="form-row"><label>Email address</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} required /></div>
            {msg && <p style={{ color: 'var(--success)', fontSize: 13, marginBottom: 8 }}>{msg}</p>}
            <div className="form-actions">
              <button type="submit" className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6 }} disabled={create.isPending}>
                <UserPlus size={14} /> Send invite
              </button>
            </div>
          </form>
        </div>

        <div className="card">
          <div style={{ fontWeight: 600, marginBottom: 12 }}>Pending invites</div>
          {invites.length === 0 ? <p style={{ color: 'var(--text-muted)' }}>No invites.</p> : (
            <table className="table">
              <thead><tr><th>Email</th><th>Expires</th><th>Used</th><th></th></tr></thead>
              <tbody>
                {invites.map(i => (
                  <tr key={i.id}>
                    <td>{i.email}</td>
                    <td>{formatDate(i.expires_at)}</td>
                    <td>{i.used_at ? formatDate(i.used_at) : <span style={{ color: 'var(--text-muted)' }}>pending</span>}</td>
                    <td><button className="btn-ghost" style={{ padding: '4px 8px', color: 'var(--danger)' }} onClick={() => del.mutate(i.id)}><Trash2 size={14} /></button></td>
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
