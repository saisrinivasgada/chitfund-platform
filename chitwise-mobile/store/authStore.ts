import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';

export type UserRole = 'ADMIN' | 'MANAGER' | 'STAFF' | 'MEMBER' | 'SUPER_ADMIN';

export interface AccountCachedInfo {
  outstandingBalance?: number;
  pendingCollectionAmount?: number;
  activeGroupsCount?: number;
  totalMembersCount?: number;
}

export interface AuthUser {
  id: string;
  username: string;
  fullName: string;
  role: UserRole;
  token: string;
  refreshToken?: string;
  tenantId?: string;
  tenantName?: string;
  mustChangePassword?: boolean;
}

export interface StoredAccount {
  userId: string;
  username: string;
  fullName: string;
  role: UserRole;
  token: string;
  refreshToken?: string;
  tenantId?: string;
  tenantName?: string;
  sessionValid: boolean;
  cachedInfo?: AccountCachedInfo;
  savedAt: number;
}

interface AuthState {
  user: AuthUser | null;
  accounts: StoredAccount[];
  isLoading: boolean;
  setUser: (user: AuthUser | null) => void;
  logout: () => Promise<void>;
  logoutFromAccount: (userId: string) => Promise<void>;
  logoutAll: () => Promise<void>;
  loadFromStorage: () => Promise<void>;
  switchToAccount: (userId: string) => Promise<boolean | 'needs-login'>;
  removeAccount: (userId: string) => Promise<void>;
  updateTokenForAccount: (userId: string, token: string, refreshToken?: string) => Promise<void>;
  markSessionInvalid: (userId: string) => Promise<void>;
  updateCachedInfo: (userId: string, info: AccountCachedInfo) => Promise<void>;
}

const TOKEN_KEY         = 'chitwise_token';
const REFRESH_TOKEN_KEY = 'chitwise_refresh_token';
const USER_KEY          = 'chitwise_user';
const ACCOUNTS_KEY      = 'chitwise_accounts';

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
      if (user.refreshToken) {
        await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, user.refreshToken);
      }
      await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));

      const existing = await loadAccounts();
      const idx = existing.findIndex((a) => a.userId === user.id);
      const entry: StoredAccount = {
        userId: user.id,
        username: user.username,
        fullName: user.fullName,
        role: user.role,
        token: user.token,
        refreshToken: user.refreshToken,
        tenantId: user.tenantId,
        tenantName: user.tenantName,
        sessionValid: true,
        cachedInfo: idx >= 0 ? existing[idx].cachedInfo : undefined,
        savedAt: Date.now(),
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
      await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
      await SecureStore.deleteItemAsync(USER_KEY);
    }
  },

  logout: async () => {
    const { user } = get();
    if (user) {
      const accounts = await loadAccounts();
      const updated = accounts.map((a) =>
        a.userId === user.id ? { ...a, sessionValid: false } : a
      );
      await saveAccounts(updated);
      set({ accounts: updated });
    }
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
    await SecureStore.deleteItemAsync(USER_KEY);
    set({ user: null });
  },

  logoutFromAccount: async (userId: string) => {
    const accounts = await loadAccounts();
    const updated = accounts.map((a) =>
      a.userId === userId ? { ...a, sessionValid: false, token: '', refreshToken: undefined } : a
    );
    await saveAccounts(updated);
    set({ accounts: updated });

    const { user } = get();
    if (user?.id === userId) {
      await SecureStore.deleteItemAsync(TOKEN_KEY);
      await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
      await SecureStore.deleteItemAsync(USER_KEY);
      set({ user: null });
    }
  },

  logoutAll: async () => {
    const accounts = await loadAccounts();
    const updated = accounts.map((a) => ({ ...a, sessionValid: false, token: '', refreshToken: undefined }));
    await saveAccounts(updated);
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
    await SecureStore.deleteItemAsync(USER_KEY);
    set({ user: null, accounts: updated });
  },

  markSessionInvalid: async (userId: string) => {
    const isCurrentUser = get().user?.id === userId;
    const accounts = await loadAccounts();
    const updated = accounts.map((a) =>
      a.userId === userId ? { ...a, sessionValid: false } : a
    );
    await saveAccounts(updated);
    set((s) => ({ accounts: updated, user: s.user?.id === userId ? null : s.user }));
    if (isCurrentUser) {
      await SecureStore.deleteItemAsync(TOKEN_KEY);
      await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
      await SecureStore.deleteItemAsync(USER_KEY);
    }
  },

  switchToAccount: async (userId: string) => {
    const accounts = await loadAccounts();
    const target = accounts.find((a) => a.userId === userId);
    if (!target) return false;
    if (!target.sessionValid) return 'needs-login';

    const user: AuthUser = {
      id: target.userId,
      username: target.username,
      fullName: target.fullName,
      role: target.role,
      token: target.token,
      refreshToken: target.refreshToken,
      tenantId: target.tenantId,
      tenantName: target.tenantName,
    };
    await SecureStore.setItemAsync(TOKEN_KEY, target.token);
    if (target.refreshToken) {
      await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, target.refreshToken);
    } else {
      await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
    }
    await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));

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

  updateTokenForAccount: async (userId: string, token: string, refreshToken?: string) => {
    const accounts = await loadAccounts();
    const updated = accounts.map((a) =>
      a.userId === userId
        ? { ...a, token, refreshToken: refreshToken ?? a.refreshToken, sessionValid: true, savedAt: Date.now() }
        : a
    );
    await saveAccounts(updated);
    set((s) => ({
      accounts: updated,
      user: s.user?.id === userId
        ? { ...s.user, token, refreshToken: refreshToken ?? s.user.refreshToken }
        : s.user,
    }));
  },

  updateCachedInfo: async (userId: string, info: AccountCachedInfo) => {
    const accounts = await loadAccounts();
    const updated = accounts.map((a) =>
      a.userId === userId ? { ...a, cachedInfo: { ...a.cachedInfo, ...info } } : a
    );
    await saveAccounts(updated);
    set({ accounts: updated });
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
