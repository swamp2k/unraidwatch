import { Sun, Moon, Menu } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useUIStore } from '../../hooks/useUI';

export function TopBar({ title }: { title: string }) {
  const { user } = useAuth();
  const { openNav } = useUIStore();
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return (localStorage.getItem('theme') as 'dark' | 'light') ?? 'dark';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  return (
    <div className="topbar">
      <div className="flex items-center gap-2" style={{ minWidth: 0 }}>
        <button
          className="btn-ghost nav-toggle"
          style={{ padding: '6px 10px' }}
          onClick={openNav}
          aria-label="Open navigation menu"
        >
          <Menu size={18} />
        </button>
        <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
      </div>
      <div className="flex items-center gap-2">
        <button
          className="btn-ghost"
          style={{ padding: '6px 10px' }}
          onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
          aria-label="Toggle theme"
        >
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
        <span className="topbar-email" style={{ color: 'var(--text-muted)', fontSize: 13 }}>{user?.email}</span>
      </div>
    </div>
  );
}
