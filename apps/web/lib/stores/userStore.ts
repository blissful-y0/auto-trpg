import { create } from 'zustand';

interface UserProfile {
  id: string;
  email: string;
  nickname: string;
  avatarUrl?: string;
}

interface UserState {
  user: UserProfile | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  // 인증 액션
  setUser: (user: UserProfile | null) => void;
  setLoading: (loading: boolean) => void;
  logout: () => void;
}

export const useUserStore = create<UserState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,

  setUser: (user) =>
    set({
      user,
      isAuthenticated: !!user,
      isLoading: false,
    }),

  setLoading: (isLoading) => set({ isLoading }),

  logout: () =>
    set({
      user: null,
      isAuthenticated: false,
      isLoading: false,
    }),
}));
