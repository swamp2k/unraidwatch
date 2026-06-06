import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../../hooks/useAuth';

export function ProtectedRoute({ children, adminOnly = false }: { children: React.ReactNode; adminOnly?: boolean }) {
  const { user, loading } = useAuthStore();

  if (loading) return <div className="loading">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (adminOnly && user.role !== 'admin') return <Navigate to="/" replace />;

  return <>{children}</>;
}
