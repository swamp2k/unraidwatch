import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuthStore } from '../hooks/useAuth';

export function Login() {
  const navigate = useNavigate();
  const setUser = useAuthStore(s => s.setUser);
  const [tab, setTab] = useState<'password' | 'magic'>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handlePassword(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const user = await api.post<{ id: string; email: string; role: 'admin' | 'user' }>('/api/auth/login', { email, password });
      setUser(user);
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleMagic(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.post('/api/auth/magic-request', { email });
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send link');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg)' }}>
      <div className="card" style={{ width: 360 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 20, color: 'var(--accent)' }}>UnraidWatch</h1>

        <div className="flex gap-2 mb-4">
          <button className={tab === 'password' ? 'btn-primary' : 'btn-ghost'} onClick={() => setTab('password')}>Password</button>
          <button className={tab === 'magic' ? 'btn-primary' : 'btn-ghost'} onClick={() => setTab('magic')}>Magic link</button>
        </div>

        {tab === 'password' ? (
          <form onSubmit={(e) => void handlePassword(e)}>
            <div className="form-row">
              <label>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required />
            </div>
            <div className="form-row">
              <label>Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} required />
            </div>
            {error && <p className="error-msg">{error}</p>}
            <button className="btn-primary w-full mt-4" type="submit" disabled={loading}>
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        ) : sent ? (
          <p style={{ color: 'var(--success)' }}>Check your email for a sign-in link.</p>
        ) : (
          <form onSubmit={(e) => void handleMagic(e)}>
            <div className="form-row">
              <label>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required />
            </div>
            {error && <p className="error-msg">{error}</p>}
            <button className="btn-primary w-full mt-4" type="submit" disabled={loading}>
              {loading ? 'Sending…' : 'Send magic link'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
