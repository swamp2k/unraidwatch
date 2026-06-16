import { create } from 'zustand';

interface UIState {
  /** Whether the mobile navigation drawer is open. */
  navOpen: boolean;
  openNav: () => void;
  closeNav: () => void;
  toggleNav: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  navOpen: false,
  openNav: () => set({ navOpen: true }),
  closeNav: () => set({ navOpen: false }),
  toggleNav: () => set((s) => ({ navOpen: !s.navOpen })),
}));
