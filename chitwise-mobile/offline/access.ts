import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
import { accountForScope, requestAsAccount } from './accountClient';
import { effectiveOfflineAccess, belongsToAccount, type OfflineAccess } from './accessPolicy';

export const useOfflineAccessStore = create<{
  accounts: Record<string, OfflineAccess>;
  put: (scope: string, access: OfflineAccess) => void;
}>((set) => ({
  accounts: {},
  put: (scope, access) => set((state) => ({ accounts: { ...state.accounts, [scope]: access } })),
}));

async function storageKey(scope: string) {
  return `chitwise_offline_access_${await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, scope)}`;
}

export async function restoreOfflineAccess(scope: string): Promise<void> {
  const account = accountForScope(scope);
  if (!account?.sessionValid) return;
  if (useOfflineAccessStore.getState().accounts[scope]) return;
  const raw = await SecureStore.getItemAsync(await storageKey(scope));
  if (!raw) return;
  try {
    const access = JSON.parse(raw) as OfflineAccess;
    if (belongsToAccount(access, account)) useOfflineAccessStore.getState().put(scope, access);
  } catch { /* Corrupt metadata never grants access. */ }
}

const requests = new Map<string, Promise<OfflineAccess>>();
export function refreshOfflineAccess(scope: string): Promise<OfflineAccess> {
  const existing = requests.get(scope);
  if (existing) return existing;
  const task = (async () => {
    const response = await requestAsAccount(scope, { method: 'POST', url: '/users/me/offline-access' });
    const access = { ...(response.data?.data ?? response.data), checkedAt: Date.now() } as OfflineAccess;
    const account = accountForScope(scope);
    if (!account?.sessionValid || !belongsToAccount(access, account)) {
      throw new Error('Offline access response did not match its organisation account');
    }
    // A failure to persist is a failure to enable durable offline work.
    await SecureStore.setItemAsync(await storageKey(scope), JSON.stringify(access), {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
    });
    useOfflineAccessStore.getState().put(scope, access);
    return access;
  })().finally(() => requests.delete(scope));
  requests.set(scope, task);
  return task;
}

export function offlineAccessForScope(scope: string): OfflineAccess | undefined {
  const account = accountForScope(scope);
  return effectiveOfflineAccess(useOfflineAccessStore.getState().accounts[scope], account?.offlineEnabled, account?.offlineSubscriptionCheckedAt ?? account?.savedAt);
}

export function hasOfflineAccess(scope: string): boolean {
  return offlineAccessForScope(scope)?.enabled === true;
}
