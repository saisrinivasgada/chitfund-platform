import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';

export type UserRole = 'ADMIN' | 'MANAGER' | 'STAFF' | 'MEMBER' | 'SUPER_ADMIN' | 'SUPPORT_AGENT';

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
  hubToken?: string;
  authSource?: 'ORGANIZATION' | 'HUB';
  tenantId?: string;
  tenantName?: string;
  mustChangePassword?: boolean;
  chatEnabled?: boolean;
  adminPhone?: string;
  adminEmail?: string;
  phone?: string;
  phoneCountryCode?: string;
  canManageIdentityCases?: boolean;
  platformOwner?: boolean;
}

export interface StoredAccount {
  accountId: string;
  userId: string;
  username: string;
  fullName: string;
  role: UserRole;
  token: string;
  refreshToken?: string;
  hubToken?: string;
  authSource?: 'ORGANIZATION' | 'HUB';
  tenantId?: string;
  tenantName?: string;
  phone?: string;
  phoneCountryCode?: string;
  canManageIdentityCases?: boolean;
  platformOwner?: boolean;
  sessionValid: boolean;
  cachedInfo?: AccountCachedInfo;
  savedAt: number;
}

export function accountStorageId(userId: string, tenantId?: string, authSource: 'ORGANIZATION' | 'HUB' = 'ORGANIZATION') {
  return `${authSource}:${userId}:${tenantId ?? '-'}`;
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
  updateAccountPhone: (accountId: string, phone?: string, phoneCountryCode?: string) => Promise<void>;
}

const TOKEN_KEY         = 'chitwise_token';
const REFRESH_TOKEN_KEY = 'chitwise_refresh_token';
const USER_KEY          = 'chitwise_user';
const ACCOUNTS_KEY      = 'chitwise_accounts';
const HUB_TOKEN_KEY     = 'chitwise_hub_token';

async function loadAccounts(): Promise<StoredAccount[]> {
  try {
    const raw = await SecureStore.getItemAsync(ACCOUNTS_KEY);
    if (raw) return (JSON.parse(raw) as StoredAccount[]).map((a) => ({
      ...a,
      accountId: a.accountId ?? accountStorageId(a.userId, a.tenantId, a.authSource ?? 'ORGANIZATION'),
    }));
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
      if (user.hubToken) await SecureStore.setItemAsync(HUB_TOKEN_KEY, user.hubToken);
      else await SecureStore.deleteItemAsync(HUB_TOKEN_KEY);
      await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));

      const existing = await loadAccounts();
      const id = accountStorageId(user.id, user.tenantId, user.authSource ?? 'ORGANIZATION');
      const idx = existing.findIndex((a) => a.accountId === id);
      const entry: StoredAccount = {
        accountId: id,
        userId: user.id,
        username: user.username,
        fullName: user.fullName,
        role: user.role,
        token: user.token,
        refreshToken: user.refreshToken,
        hubToken: user.hubToken,
        authSource: user.authSource ?? 'ORGANIZATION',
        tenantId: user.tenantId,
        tenantName: user.tenantName,
        phone: user.phone ?? (idx >= 0 ? existing[idx].phone : undefined),
        phoneCountryCode: user.phoneCountryCode ?? (idx >= 0 ? existing[idx].phoneCountryCode : undefined),
        canManageIdentityCases: user.canManageIdentityCases,
        platformOwner: user.platformOwner,
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
      await SecureStore.deleteItemAsync(HUB_TOKEN_KEY);
    }
  },

  logout: async () => {
    const { user } = get();
    if (user?.authSource === 'HUB' && user.refreshToken) {
      try {
        await fetch(`${process.env.EXPO_PUBLIC_API_URL ?? ''}/hub/auth/logout`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: user.refreshToken }),
        });
      } catch {}
    }
    if (user) {
      const accounts = await loadAccounts();
      const updated = accounts.map((a) =>
        a.accountId === accountStorageId(user.id, user.tenantId, user.authSource ?? 'ORGANIZATION') ? { ...a, sessionValid: false } : a
      );
      await saveAccounts(updated);
      set({ accounts: updated });
    }
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
    await SecureStore.deleteItemAsync(USER_KEY);
    await SecureStore.deleteItemAsync(HUB_TOKEN_KEY);
    set({ user: null });
  },

  logoutFromAccount: async (accountId: string) => {
    const accounts = await loadAccounts();
    const updated = accounts.map((a) =>
      a.accountId === accountId ? { ...a, sessionValid: false, token: '', refreshToken: undefined } : a
    );
    await saveAccounts(updated);
    set({ accounts: updated });

    const { user } = get();
    if (user && accountStorageId(user.id, user.tenantId, user.authSource ?? 'ORGANIZATION') === accountId) {
      await SecureStore.deleteItemAsync(TOKEN_KEY);
      await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
      await SecureStore.deleteItemAsync(USER_KEY);
      await SecureStore.deleteItemAsync(HUB_TOKEN_KEY);
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
    await SecureStore.deleteItemAsync(HUB_TOKEN_KEY);
    set({ user: null, accounts: updated });
  },

  markSessionInvalid: async (accountId: string) => {
    const current = get().user;
    const isCurrentUser = !!current && accountStorageId(current.id, current.tenantId, current.authSource ?? 'ORGANIZATION') === accountId;
    const accounts = await loadAccounts();
    const updated = accounts.map((a) =>
      a.accountId === accountId ? { ...a, sessionValid: false } : a
    );
    await saveAccounts(updated);
    set((s) => ({ accounts: updated, user: isCurrentUser ? null : s.user }));
    if (isCurrentUser) {
      await SecureStore.deleteItemAsync(TOKEN_KEY);
      await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
      await SecureStore.deleteItemAsync(USER_KEY);
      await SecureStore.deleteItemAsync(HUB_TOKEN_KEY);
    }
  },

  switchToAccount: async (accountId: string) => {
    const accounts = await loadAccounts();
    const target = accounts.find((a) => a.accountId === accountId);
    if (!target) return false;
    if (!target.sessionValid) return 'needs-login';

    const user: AuthUser = {
      id: target.userId,
      username: target.username,
      fullName: target.fullName,
      role: target.role,
      token: target.token,
      refreshToken: target.refreshToken,
      hubToken: target.hubToken,
      authSource: target.authSource ?? 'ORGANIZATION',
      tenantId: target.tenantId,
      tenantName: target.tenantName,
      phone: target.phone,
      phoneCountryCode: target.phoneCountryCode,
      canManageIdentityCases: target.canManageIdentityCases,
      platformOwner: target.platformOwner,
    };
    await SecureStore.setItemAsync(TOKEN_KEY, target.token);
    if (target.refreshToken) {
      await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, target.refreshToken);
    } else {
      await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
    }
    await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
    if (target.hubToken) await SecureStore.setItemAsync(HUB_TOKEN_KEY, target.hubToken);
    else await SecureStore.deleteItemAsync(HUB_TOKEN_KEY);

    const reordered = [
      { ...target, savedAt: Date.now() },
      ...accounts.filter((a) => a.accountId !== accountId),
    ];
    await saveAccounts(reordered);
    set({ user, accounts: reordered });
    return true;
  },

  removeAccount: async (accountId: string) => {
    const accounts = await loadAccounts();
    const updated = accounts.filter((a) => a.accountId !== accountId);
    await saveAccounts(updated);
    const current = get().user;
    const removingCurrent = !!current
      && accountStorageId(current.id, current.tenantId, current.authSource ?? 'ORGANIZATION') === accountId;
    if (removingCurrent) {
      await SecureStore.deleteItemAsync(TOKEN_KEY);
      await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
      await SecureStore.deleteItemAsync(USER_KEY);
      await SecureStore.deleteItemAsync(HUB_TOKEN_KEY);
    }
    set((state) => ({ accounts: updated, user: removingCurrent ? null : state.user }));
  },

  updateTokenForAccount: async (accountId: string, token: string, refreshToken?: string) => {
    const accounts = await loadAccounts();
    const updated = accounts.map((a) =>
      a.accountId === accountId
        ? { ...a, token, refreshToken: refreshToken ?? a.refreshToken, sessionValid: true, savedAt: Date.now() }
        : a
    );
    await saveAccounts(updated);
    set((s) => {
      const isCurrentUser = !!s.user
        && accountStorageId(s.user.id, s.user.tenantId, s.user.authSource ?? 'ORGANIZATION') === accountId;
      const nextUser = isCurrentUser
        ? { ...s.user!, token, refreshToken: refreshToken ?? s.user!.refreshToken }
        : s.user;
      // Keep USER_KEY in sync so loadFromStorage on next open restores a fresh token.
      if (isCurrentUser) SecureStore.setItemAsync(USER_KEY, JSON.stringify(nextUser));
      return { accounts: updated, user: nextUser };
    });
  },

  updateCachedInfo: async (accountId: string, info: AccountCachedInfo) => {
    const accounts = await loadAccounts();
    const updated = accounts.map((a) =>
      a.accountId === accountId ? { ...a, cachedInfo: { ...a.cachedInfo, ...info } } : a
    );
    await saveAccounts(updated);
    set({ accounts: updated });
  },

  updateAccountPhone: async (accountId: string, phone?: string, phoneCountryCode?: string) => {
    if (!phone) return;
    const accounts = await loadAccounts();
    const updated = accounts.map((a) =>
      a.accountId === accountId ? { ...a, phone, phoneCountryCode } : a
    );
    await saveAccounts(updated);
    set((s) => {
      const isCurrentUser = !!s.user
        && accountStorageId(s.user.id, s.user.tenantId, s.user.authSource ?? 'ORGANIZATION') === accountId;
      return { accounts: updated, user: isCurrentUser ? { ...s.user!, phone, phoneCountryCode } : s.user };
    });
  },

  loadFromStorage: async () => {
    try {
      const [raw, accounts, token] = await Promise.all([
        SecureStore.getItemAsync(USER_KEY),
        loadAccounts(),
        SecureStore.getItemAsync(TOKEN_KEY),
      ]);
      if (raw) {
        let user = JSON.parse(raw) as AuthUser;
        // Backfill tenantId from JWT for sessions stored before the JWT-decode fix.
        if (!user.tenantId && token) {
          try {
            const part = token.split('.')[1];
            if (part) {
              const padded = part.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((part.length + 3) % 4 || 4);
              const claims = JSON.parse(atob(padded));
              if (typeof claims.tenantId === 'string') user = { ...user, tenantId: claims.tenantId };
            }
          } catch {}
        }
        set({ user, accounts, isLoading: false });
      } else {
        set({ accounts, isLoading: false });
      }
    } catch {
      set({ isLoading: false });
    }
  },
}));
