import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';

export type UserRole = 'ADMIN' | 'MANAGER' | 'WORKER' | 'MEMBER';

export interface AuthUser {
  id: string;
  username: string;
  fullName: string;
  role: UserRole;
  token: string;
}

interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  setUser: (user: AuthUser | null) => void;
  logout: () => Promise<void>;
  loadFromStorage: () => Promise<void>;
}

const TOKEN_KEY = 'chitwise_token';
const USER_KEY  = 'chitwise_user';

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: true,

  setUser: async (user) => {
    set({ user });
    if (user) {
      await SecureStore.setItemAsync(TOKEN_KEY, user.token);
      await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
    } else {
      await SecureStore.deleteItemAsync(TOKEN_KEY);
      await SecureStore.deleteItemAsync(USER_KEY);
    }
  },

  logout: async () => {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    await SecureStore.deleteItemAsync(USER_KEY);
    set({ user: null });
  },

  loadFromStorage: async () => {
    try {
      const raw = await SecureStore.getItemAsync(USER_KEY);
      if (raw) {
        const user = JSON.parse(raw) as AuthUser;
        set({ user, isLoading: false });
      } else {
        set({ isLoading: false });
      }
    } catch {
      set({ isLoading: false });
    }
  },
}));
