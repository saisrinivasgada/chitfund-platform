import axios, { type AxiosRequestConfig } from 'axios';
import { useAuthStore, type StoredAccount } from '../store/authStore';
import { getStoredAccountScope } from './accountScope';

const baseURL = process.env.EXPO_PUBLIC_API_URL ?? '';
const refreshing = new Map<string, Promise<void>>();

export function accountForScope(scope: string): StoredAccount | undefined {
  return useAuthStore.getState().accounts.find((account) => getStoredAccountScope(account) === scope);
}

function requireAccount(scope: string): StoredAccount {
  const account = accountForScope(scope);
  if (!account?.sessionValid || !account.token || account.authSource === 'HUB') {
    throw Object.assign(new Error('Sign in to this organisation again to sync its saved work'), { requiresLogin: true });
  }
  return account;
}

export async function refreshAccountSession(scope: string): Promise<void> {
  const account = requireAccount(scope);
  const existing = refreshing.get(account.accountId);
  if (existing) return existing;
  const task = (async () => {
    if (!account.refreshToken) throw Object.assign(new Error('Login required'), { requiresLogin: true });
    const response = await axios.post(`${baseURL}/auth/refresh`, { refreshToken: account.refreshToken }, {
      timeout: 20_000, headers: { 'X-Client-Source': 'MOBILE' },
    });
    const auth = response.data?.data ?? response.data;
    const current = requireAccount(scope);
    if (current.refreshToken !== account.refreshToken
        || String(auth.user?.id) !== account.userId || auth.tenant?.tenantId !== account.tenantId
        || (auth.tenant?.role ?? auth.user?.role) !== account.role) {
      throw Object.assign(new Error('This account changed while refreshing; sign in again'), { requiresLogin: true });
    }
    await useAuthStore.getState().updateTokenForAccount(account.accountId, auth.accessToken, auth.refreshToken, account.refreshToken);
  })().catch(async (error) => {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      await useAuthStore.getState().markSessionInvalid(account.accountId, account.refreshToken);
    }
    throw error;
  }).finally(() => refreshing.delete(account.accountId));
  refreshing.set(account.accountId, task);
  return task;
}

/** Credentials are pinned to the owning account, never to the currently visible screen. */
export async function requestAsAccount(scope: string, config: AxiosRequestConfig) {
  const send = () => {
    const account = requireAccount(scope);
    return axios.request({ ...config, baseURL, timeout: 20_000, headers: {
      ...config.headers, 'X-Client-Source': 'MOBILE', Authorization: `Bearer ${account.token}`,
    } });
  };
  try {
    return await send();
  } catch (error) {
    if (!axios.isAxiosError(error) || error.response?.status !== 401) throw error;
    await refreshAccountSession(scope);
    return send();
  }
}
