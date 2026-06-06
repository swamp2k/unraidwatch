import { useState, FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuthStore } from '../hooks/useAuth';

export function AcceptInvite() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const setUser = useAuthStore(s => s.setUser);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (password !== confirm) { setError('Passwords do not match'); return; }
    setError('');
    setLoading(true);
    try {
      await api.post('/api/auth/accept-invite', { token, password });
      const user = await api.get<{ id: string; email: string; role: 'admin' | 'user' }>('/api/auth/me');
      setUser(user);
      navigate('/settings/server');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create account');
    } finally {
      setLoading(false);
    }
  }

  if (!token) return <div className="loading">Invalid invite link.</div>;

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg)' }}>
      <div className="card" style={{ width: 360 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 6, color: 'var(--accent)' }}>Create your account</h1>
        <p style={{ color: 'var(--text-muted)', marginBottom: 20, fontSize: 13 }}>Set a password to complete your UnraidWatch account.</p>
        <form onSubmit={(e) => void handleSubmit(e)}>
          <div className="form-row">
            <label>Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} />
          </div>
          <div className="form-row">
            <label>Confirm password</label>
            <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required />
          </div>
          {error && <p className="error-msg">{error}</p>}
          <button className="btn-primary w-full mt-4" type="submit" disabled={loading}>
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>
      </div>
    </div>
  );
}
