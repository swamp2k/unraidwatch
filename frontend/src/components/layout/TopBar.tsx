import { Sun, Moon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';

export function TopBar({ title }: { title: string }) {
  const { user } = useAuth();
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return (localStorage.getItem('theme') as 'dark' | 'light') ?? 'dark';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  return (
    <div className="topbar">
      <span style={{ fontWeight: 600 }}>{title}</span>
      <div className="flex items-center gap-2">
        <button
          className="btn-ghost"
          style={{ padding: '6px 10px' }}
          onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
          aria-label="Toggle theme"
        >
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
        <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{user?.email}</span>
      </div>
    </div>
  );
}
