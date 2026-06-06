import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Box, Monitor, HardDrive, Zap, BrainCircuit, Search, Bell, Settings, ShieldCheck, LogOut } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/docker', label: 'Docker', icon: Box },
  { to: '/vms', label: 'VMs', icon: Monitor },
  { to: '/shares', label: 'Shares', icon: HardDrive },
  { to: '/ups', label: 'UPS', icon: Zap },
  { to: '/ai', label: 'AI Syslog', icon: BrainCircuit },
  { to: '/detective', label: 'AI Detective', icon: Search },
  { to: '/alerts', label: 'Alerts', icon: Bell },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export function Sidebar() {
  const { user, logout } = useAuth();

  return (
    <nav className="sidebar">
      <div className="sidebar-logo">UnraidWatch</div>
      {navItems.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
        >
          <Icon size={16} />
          {label}
        </NavLink>
      ))}
      {user?.role === 'admin' && (
        <NavLink to="/admin/invites" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
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
  );
}
