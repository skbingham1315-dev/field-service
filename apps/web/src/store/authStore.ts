import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User } from '@fsp/types';
import { api } from '../lib/api';

interface AuthState {
  isAuthenticated: boolean;
  accessToken: string | null;
  refreshToken: string | null;
  user: Pick<User, 'id' | 'email' | 'firstName' | 'lastName' | 'role' | 'tenantId'> | null;
  login: (
    email: string,
    password: string,
    tenantSlug: string,
  ) => Promise<void>;
  logout: () => Promise<void>;
  setTokens: (accessToken: string, refreshToken: string) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      isAuthenticated: false,
      accessToken: null,
      refreshToken: null,
      user: null,

      login: async (email, password, tenantSlug) => {
        const { data } = await api.post('/auth/login', { email, password, tenantSlug });
        const { accessToken, refreshToken, user } = data.data;
        set({ isAuthenticated: true, accessToken, refreshToken, user });
      },

      logout: async () => {
        const { refreshToken } = get();
        try {
          await api.post('/auth/logout', { refreshToken });
        } catch {
          // ignore
        }
        set({ isAuthenticated: false, accessToken: null, refreshToken: null, user: null });
      },

      setTokens: (accessToken, refreshToken) => {
        set({ accessToken, refreshToken });
      },
    }),
    {
      name: 'fsp-auth',
      partialize: (state) => ({
        isAuthenticated: state.isAuthenticated,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        user: state.user,
      }),
    },
  ),
);
