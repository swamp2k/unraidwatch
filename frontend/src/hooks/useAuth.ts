import { create } from 'zustand';
import { api } from '../lib/api';

interface AuthUser {
  id: string;
  email: string;
  role: 'admin' | 'user';
}

interface AuthStore {
  user: AuthUser | null;
  loading: boolean;
  setUser: (u: AuthUser | null) => void;
  setLoading: (v: boolean) => void;
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  loading: true,
  setUser: (user) => set({ user }),
  setLoading: (loading) => set({ loading }),
}));

export function useAuth() {
  const { user, loading, setUser, setLoading } = useAuthStore();

  async function fetchMe() {
    try {
      const me = await api.get<AuthUser>('/api/auth/me');
      setUser(me);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    await api.post('/api/auth/logout');
    setUser(null);
    window.location.href = '/login';
  }

  return { user, loading, fetchMe, logout };
}
