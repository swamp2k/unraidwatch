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
  const [msgOk, setMsgOk] = useState(true);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (data) { setLabel(data.label); setUrl(data.url); }
  }, [data]);

  function ok(s: string)  { setMsg(s); setMsgOk(true); }
  function err(s: string) { setMsg(s); setMsgOk(false); }

  const save = useMutation({
    mutationFn: () => {
      if (!url.trim())    throw new Error('URL is required.');
      if (!apiKey.trim()) throw new Error('API Key is required.');
      return api.put('/api/server', { label, url: url.trim(), api_key: apiKey.trim() });
    },
    onSuccess: () => ok('Saved.'),
    onError:   (e) => err(e instanceof Error ? e.message : 'Save failed.'),
  });

  async function testConn() {
    setTesting(true);
    try { await api.post('/api/server/test'); ok('Connection successful!'); }
    catch (e) { err(e instanceof Error ? e.message : 'unknown'); }
    finally { setTesting(false); }
  }

  return (
    <div className="card" style={{ maxWidth: 520 }}>
      <h3 style={{ fontWeight: 600, marginBottom: 16 }}>Unraid Server</h3>
      <form onSubmit={(e: FormEvent) => { e.preventDefault(); save.mutate(); }}>
        <div className="form-row"><label>Label</label><input value={label} onChange={e => setLabel(e.target.value)} /></div>
        <div className="form-row"><label>URL</label><input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://unraid-api.jeppesen.cc" /></div>
        <div className="form-row"><label>API Key</label><input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder={data ? '(saved — paste new to update)' : 'Paste API key'} /></div>
        {msg && <p style={{ color: msgOk ? 'var(--success)' : 'var(--danger)', fontSize: 13, marginBottom: 8 }}>{msg}</p>}
        <div className="form-actions">
          <button type="button" className="btn-ghost" onClick={() => void testConn()} disabled={testing}>{testing ? 'Testing…' : 'Test connection'}</button>
          <button type="submit" className="btn-primary" disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save'}</button>
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

interface RetentionData { system: number; container: number; vm: number }

const DAY_OPTIONS = [1, 2, 3, 4, 5, 6, 7];

function RetentionConfig() {
  const { data, isLoading } = useQuery<RetentionData>({
    queryKey: ['retention-settings'],
    queryFn: () => api.get('/api/settings/retention'),
  });

  const [system, setSystem]       = useState(7);
  const [container, setContainer] = useState(7);
  const [vm, setVm]               = useState(7);
  const [msg, setMsg]             = useState('');

  useEffect(() => {
    if (data) {
      setSystem(data.system);
      setContainer(data.container);
      setVm(data.vm);
    }
  }, [data]);

  const save = useMutation({
    mutationFn: () => api.put('/api/settings/retention', { system, container, vm }),
    onSuccess: () => setMsg('Saved.'),
  });

  if (isLoading) return <div className="card" style={{ maxWidth: 520, color: 'var(--text-muted)', fontSize: 13 }}>Loading…</div>;

  return (
    <div className="card" style={{ maxWidth: 520 }}>
      <h3 style={{ fontWeight: 600, marginBottom: 4 }}>History Retention</h3>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>
        How many days of historical chart data to keep. Older data is automatically purged.
      </p>

      <form onSubmit={(e: FormEvent) => { e.preventDefault(); save.mutate(); }}>
        <RetentionRow label="Unraid System" sublabel="CPU, RAM, temperature, network charts" value={system} onChange={setSystem} />
        <RetentionRow label="Docker Containers" sublabel="Per-container CPU, RAM, network history" value={container} onChange={setContainer} />
        <RetentionRow label="Virtual Machines" sublabel="Reserved for future VM metrics" value={vm} onChange={setVm} />

        {msg && <p style={{ color: 'var(--success)', fontSize: 13, marginBottom: 8 }}>{msg}</p>}
        <div className="form-actions">
          <button type="submit" className="btn-primary" disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </div>
  );
}

function RetentionRow({ label, sublabel, value, onChange }: {
  label: string;
  sublabel: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
        <div>
          <div style={{ fontWeight: 500, fontSize: 14 }}>{label}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{sublabel}</div>
        </div>
        <span style={{ fontWeight: 600, fontSize: 14, minWidth: 60, textAlign: 'right' }}>
          {value} {value === 1 ? 'day' : 'days'}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          type="range"
          min={1}
          max={7}
          step={1}
          value={value}
          onChange={e => onChange(parseInt(e.target.value))}
          style={{ flex: 1 }}
        />
        <div style={{ display: 'flex', gap: 1 }}>
          {DAY_OPTIONS.map(d => (
            <button
              key={d}
              type="button"
              className={value === d ? 'btn-primary' : 'btn-ghost'}
              style={{ padding: '2px 7px', fontSize: 11 }}
              onClick={() => onChange(d)}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

const settingsTabs = [
  { to: '/settings/server',    label: 'Server' },
  { to: '/settings/ai',        label: 'AI Provider' },
  { to: '/settings/retention', label: 'Retention' },
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
          <Route path="server"    element={<ServerConfig />} />
          <Route path="ai"        element={<AIConfig />} />
          <Route path="retention" element={<RetentionConfig />} />
          <Route path="*"         element={<ServerConfig />} />
        </Routes>
      </div>
    </>
  );
}
