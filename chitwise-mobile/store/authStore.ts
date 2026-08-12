import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';

export type UserRole = 'ADMIN' | 'MANAGER' | 'STAFF' | 'MEMBER' | 'SUPER_ADMIN';

export interface AuthUser {
  id: string;
  username: string;
  fullName: string;
  role: UserRole;
  token: string;
  mustChangePassword?: boolean;
}

export interface StoredAccount {
  userId: string;
  username: string;
  fullName: string;
  role: UserRole;
  token: string;
  savedAt: number; // timestamp
}

interface AuthState {
  user: AuthUser | null;
  accounts: StoredAccount[];
  isLoading: boolean;
  setUser: (user: AuthUser | null) => void;
  logout: () => Promise<void>;
  loadFromStorage: () => Promise<void>;
  saveCurrentToAccounts: () => Promise<void>;
  switchToAccount: (userId: string) => Promise<boolean>;
  removeAccount: (userId: string) => Promise<void>;
  updateTokenForAccount: (userId: string, token: string) => Promise<void>;
}

const TOKEN_KEY    = 'chitwise_token';
const USER_KEY     = 'chitwise_user';
const ACCOUNTS_KEY = 'chitwise_accounts';

async function loadAccounts(): Promise<StoredAccount[]> {
  try {
    const raw = await SecureStore.getItemAsync(ACCOUNTS_KEY);
    if (raw) return JSON.parse(raw) as StoredAccount[];
  } catch {}
  return [];
}

async function saveAccounts(accounts: StoredAccount[]) {
  await SecureStore.setItemAsync(ACCOUNTS_KEY, JSON.stringify(accounts));
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  accounts: [],
  isLoading: true,

  setUser: async (user) => {
    set({ user });
    if (user) {
      await SecureStore.setItemAsync(TOKEN_KEY, user.token);
      await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
      // Auto-save / update this account in the accounts list
      const existing = await loadAccounts();
      const idx = existing.findIndex((a) => a.userId === user.id);
      const entry: StoredAccount = {
        userId: user.id, username: user.username, fullName: user.fullName,
        role: user.role, token: user.token, savedAt: Date.now(),
      };
      if (idx >= 0) {
        existing[idx] = entry;
      } else {
        existing.unshift(entry);
      }
      await saveAccounts(existing);
      set({ accounts: existing });
    } else {
      await SecureStore.deleteItemAsync(TOKEN_KEY);
      await SecureStore.deleteItemAsync(USER_KEY);
    }
  },

  saveCurrentToAccounts: async () => {
    const { user } = get();
    if (!user) return;
    const existing = await loadAccounts();
    const idx = existing.findIndex((a) => a.userId === user.id);
    const entry: StoredAccount = {
      userId: user.id, username: user.username, fullName: user.fullName,
      role: user.role, token: user.token, savedAt: Date.now(),
    };
    if (idx >= 0) {
      existing[idx] = entry;
    } else {
      existing.unshift(entry);
    }
    await saveAccounts(existing);
    set({ accounts: existing });
  },

  switchToAccount: async (userId: string) => {
    const accounts = await loadAccounts();
    const target = accounts.find((a) => a.userId === userId);
    if (!target) return false;
    const user: AuthUser = {
      id: target.userId, username: target.username, fullName: target.fullName,
      role: target.role, token: target.token,
    };
    await SecureStore.setItemAsync(TOKEN_KEY, target.token);
    await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
    // Move this account to front of list
    const reordered = [
      { ...target, savedAt: Date.now() },
      ...accounts.filter((a) => a.userId !== userId),
    ];
    await saveAccounts(reordered);
    set({ user, accounts: reordered });
    return true;
  },

  removeAccount: async (userId: string) => {
    const accounts = await loadAccounts();
    const updated = accounts.filter((a) => a.userId !== userId);
    await saveAccounts(updated);
    set({ accounts: updated });
  },

  updateTokenForAccount: async (userId: string, token: string) => {
    const accounts = await loadAccounts();
    const updated = accounts.map((a) =>
      a.userId === userId ? { ...a, token, savedAt: Date.now() } : a
    );
    await saveAccounts(updated);
    set({ accounts: updated });
  },

  logout: async () => {
    const { user } = get();
    // Remove this account from stored list
    if (user) {
      const accounts = await loadAccounts();
      const updated = accounts.filter((a) => a.userId !== user.id);
      await saveAccounts(updated);
      set({ accounts: updated });
    }
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    await SecureStore.deleteItemAsync(USER_KEY);
    set({ user: null });
  },

  loadFromStorage: async () => {
    try {
      const [raw, accounts] = await Promise.all([
        SecureStore.getItemAsync(USER_KEY),
        loadAccounts(),
      ]);
      if (raw) {
        const user = JSON.parse(raw) as AuthUser;
        set({ user, accounts, isLoading: false });
      } else {
        set({ accounts, isLoading: false });
      }
    } catch {
      set({ isLoading: false });
    }
  },
}));
