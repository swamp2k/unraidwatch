import { useState, FormEvent, useEffect } from 'react';
import { Routes, Route, NavLink } from 'react-router-dom';
import { TopBar } from '../components/layout/TopBar';
import { api } from '../lib/api';
import { useQuery, useMutation } from '@tanstack/react-query';

function ServerConfig() {
  const { data } = useQuery<{ label: string; url: string; verified_at: number | null } | null>({
    queryKey: ['server-config'],
    queryFn: () => api.get('/api/server'),
  });
  const [label, setLabel] = useState('My Tower');
  const [url, setUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [msg, setMsg] = useState('');
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (data) { setLabel(data.label); setUrl(data.url); }
  }, [data]);

  const save = useMutation({ mutationFn: () => api.put('/api/server', { label, url, api_key: apiKey }), onSuccess: () => setMsg('Saved.') });

  async function testConn() {
    setTesting(true);
    try { await api.post('/api/server/test'); setMsg('Connection successful!'); } catch (e) { setMsg(`Failed: ${e instanceof Error ? e.message : 'unknown'}`); } finally { setTesting(false); }
  }

  return (
    <div className="card" style={{ maxWidth: 520 }}>
      <h3 style={{ fontWeight: 600, marginBottom: 16 }}>Unraid Server</h3>
      <form onSubmit={(e: FormEvent) => { e.preventDefault(); save.mutate(); }}>
        <div className="form-row"><label>Label</label><input value={label} onChange={e => setLabel(e.target.value)} /></div>
        <div className="form-row"><label>URL</label><input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://tower.local" /></div>
        <div className="form-row"><label>API Key</label><input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder={data?.verified_at ? '(saved — paste new to update)' : ''} /></div>
        {msg && <p style={{ color: 'var(--success)', fontSize: 13, marginBottom: 8 }}>{msg}</p>}
        <div className="form-actions">
          <button type="button" className="btn-ghost" onClick={() => void testConn()} disabled={testing}>{testing ? 'Testing…' : 'Test connection'}</button>
          <button type="submit" className="btn-primary">Save</button>
        </div>
      </form>
    </div>
  );
}

function AIConfig() {
  const { data } = useQuery<{ provider: string; default_model: string } | null>({
    queryKey: ['ai-config'],
    queryFn: () => api.get('/api/ai-config'),
  });
  const [provider, setProvider] = useState('claude');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('claude-haiku-4-5');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (data) { setProvider(data.provider); setModel(data.default_model); }
  }, [data]);

  const modelsByProvider: Record<string, string[]> = {
    claude: ['claude-haiku-4-5', 'claude-sonnet-4-6', 'claude-opus-4-8'],
    gemini: ['gemini-1.5-flash', 'gemini-1.5-pro'],
    openai: ['gpt-4o-mini', 'gpt-4o'],
  };

  const save = useMutation({ mutationFn: () => api.put('/api/ai-config', { provider, api_key: apiKey, default_model: model }), onSuccess: () => setMsg('Saved.') });

  return (
    <div className="card" style={{ maxWidth: 520 }}>
      <h3 style={{ fontWeight: 600, marginBottom: 16 }}>AI Provider</h3>
      <form onSubmit={(e: FormEvent) => { e.preventDefault(); save.mutate(); }}>
        <div className="form-row"><label>Provider</label>
          <select value={provider} onChange={e => { setProvider(e.target.value); setModel(modelsByProvider[e.target.value]![0]!); }}>
            <option value="claude">Anthropic Claude</option>
            <option value="gemini">Google Gemini</option>
            <option value="openai">OpenAI</option>
          </select>
        </div>
        <div className="form-row"><label>API Key</label><input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder={data ? '(saved — paste new to update)' : ''} /></div>
        <div className="form-row"><label>Default model</label>
          <select value={model} onChange={e => setModel(e.target.value)}>
            {(modelsByProvider[provider] ?? []).map(m => <option key={m}>{m}</option>)}
          </select>
        </div>
        {msg && <p style={{ color: 'var(--success)', fontSize: 13, marginBottom: 8 }}>{msg}</p>}
        <div className="form-actions"><button type="submit" className="btn-primary">Save</button></div>
      </form>
    </div>
  );
}

const settingsTabs = [
  { to: '/settings/server', label: 'Server' },
  { to: '/settings/ai', label: 'AI Provider' },
];

export function Settings() {
  return (
    <>
      <TopBar title="Settings" />
      <div className="page">
        <div className="flex gap-2 mb-4">
          {settingsTabs.map(t => (
            <NavLink key={t.to} to={t.to} className={({ isActive }) => isActive ? 'btn-primary' : 'btn-ghost'} style={{ fontSize: 13 }}>
              {t.label}
            </NavLink>
          ))}
        </div>
        <Routes>
          <Route path="server" element={<ServerConfig />} />
          <Route path="ai" element={<AIConfig />} />
          <Route path="*" element={<ServerConfig />} />
        </Routes>
      </div>
    </>
  );
}
