import { Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuth } from './hooks/useAuth';
import { useAuthStore } from './hooks/useAuth';
import { Sidebar } from './components/layout/Sidebar';
import { ProtectedRoute } from './components/layout/ProtectedRoute';
import { Login } from './pages/Login';
import { AcceptInvite } from './pages/AcceptInvite';
import { Dashboard } from './pages/Dashboard';
import { Docker } from './pages/Docker';
import { VMs } from './pages/VMs';
import { Shares } from './pages/Shares';
import { UPS } from './pages/UPS';
import { AIAnalysis } from './pages/AIAnalysis';
import { Alerts } from './pages/Alerts';
import { Settings } from './pages/Settings';
import { AdminInvites } from './pages/AdminInvites';
import { Detective } from './pages/Detective';

function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="layout">
      <Sidebar />
      <div className="main-content">
        {children}
      </div>
    </div>
  );
}

export default function App() {
  const { fetchMe } = useAuth();
  const { loading } = useAuthStore();

  useEffect(() => {
    void fetchMe();
  }, []);

  if (loading) return <div className="loading">Loading…</div>;

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/invite" element={<AcceptInvite />} />
      <Route path="/auth/magic" element={<Navigate to="/" replace />} />

      <Route path="/" element={<ProtectedRoute><AppLayout><Dashboard /></AppLayout></ProtectedRoute>} />
      <Route path="/docker" element={<ProtectedRoute><AppLayout><Docker /></AppLayout></ProtectedRoute>} />
      <Route path="/vms" element={<ProtectedRoute><AppLayout><VMs /></AppLayout></ProtectedRoute>} />
      <Route path="/shares" element={<ProtectedRoute><AppLayout><Shares /></AppLayout></ProtectedRoute>} />
      <Route path="/ups" element={<ProtectedRoute><AppLayout><UPS /></AppLayout></ProtectedRoute>} />
      <Route path="/ai" element={<ProtectedRoute><AppLayout><AIAnalysis /></AppLayout></ProtectedRoute>} />
      <Route path="/alerts" element={<ProtectedRoute><AppLayout><Alerts /></AppLayout></ProtectedRoute>} />
      <Route path="/settings/*" element={<ProtectedRoute><AppLayout><Settings /></AppLayout></ProtectedRoute>} />
      <Route path="/detective" element={<ProtectedRoute><AppLayout><Detective /></AppLayout></ProtectedRoute>} />
      <Route path="/admin/invites" element={<ProtectedRoute adminOnly><AppLayout><AdminInvites /></AppLayout></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
