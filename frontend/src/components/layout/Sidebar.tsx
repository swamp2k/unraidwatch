import { useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Box, Monitor, HardDrive, Zap, BrainCircuit, Search, Bell, Settings, ShieldCheck, LogOut, Activity, ScrollText } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useUIStore } from '../../hooks/useUI';

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/docker', label: 'Docker', icon: Box },
  { to: '/vms', label: 'VMs', icon: Monitor },
  { to: '/shares', label: 'Shares', icon: HardDrive },
  { to: '/ups', label: 'UPS', icon: Zap },
  { to: '/ai', label: 'AI Syslog', icon: BrainCircuit },
  { to: '/detective', label: 'AI Detective', icon: Search },
  { to: '/alerts', label: 'Alerts', icon: Bell },
  { to: '/monitors/docker', label: 'Docker Monitor', icon: Activity },
  { to: '/monitors/log', label: 'Log Monitor', icon: ScrollText },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export function Sidebar() {
  const { user, logout } = useAuth();
  const { navOpen, closeNav } = useUIStore();

  // Close on Escape and lock body scroll while the drawer is open.
  useEffect(() => {
    if (!navOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeNav(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [navOpen, closeNav]);

  return (
    <>
      <div
        className={`sidebar-overlay${navOpen ? ' open' : ''}`}
        onClick={closeNav}
        aria-hidden="true"
      />
      <nav className={`sidebar${navOpen ? ' open' : ''}`}>
        <div className="sidebar-logo">UnraidWatch</div>
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            onClick={closeNav}
            className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
          >
            <Icon size={16} />
            {label}
          </NavLink>
        ))}
        {user?.role === 'admin' && (
          <NavLink to="/admin/invites" onClick={closeNav} className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
            <ShieldCheck size={16} />
            Admin
          </NavLink>
        )}
        <div style={{ marginTop: 'auto', padding: '0 8px' }}>
          <button className="nav-item w-full" onClick={() => void logout()} style={{ color: 'var(--danger)' }}>
            <LogOut size={16} />
            Sign out
          </button>
        </div>
      </nav>
    </>
  );
}
