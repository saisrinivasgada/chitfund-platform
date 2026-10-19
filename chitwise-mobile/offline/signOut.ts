import { Alert } from 'react-native';
import { signOutWarning } from '../../shared/offline/signOutPolicy';
import { accountStorageId, useAuthStore } from '../store/authStore';
import { getStoredAccountScope } from './accountScope';
import { discardUnsentOperationsForSignOut, getUnsentOperationCount } from './database';
import { logoutAccount, logoutAllDevices } from '../services/api';

let signingOut: Promise<boolean> | undefined;

/** Manual sign-out only. Session expiry/invalidation must never discard payments. */
export function requestSignOut(options: { accountId?: string; all?: boolean; allDevices?: boolean } = {}): Promise<boolean> {
  if (signingOut) return signingOut;
  signingOut = performSignOut(options).finally(() => { signingOut = undefined; });
  return signingOut;
}

async function performSignOut(options: { accountId?: string; all?: boolean; allDevices?: boolean }): Promise<boolean> {
  const state = useAuthStore.getState();
  const accountId = options.accountId ?? (state.user ? accountStorageId(state.user.id, state.user.tenantId, state.user.authSource ?? 'ORGANIZATION') : null);
  const accounts = state.accounts.filter((a) => options.all || a.accountId === accountId);
  const scopes = [...new Set(accounts.filter((a) => a.authSource !== 'HUB')
    .flatMap((a) => [getStoredAccountScope(a), ...(a.retainedOfflineScopes ?? [])]))];
  try {
    const count = (await Promise.all(scopes.map(getUnsentOperationCount))).reduce((sum, n) => sum + n, 0);
    const confirmed = await new Promise<boolean>((resolve) => Alert.alert(
      count ? 'Delete unsynced payments and sign out?' : options.all ? 'Sign out of all accounts?' : 'Sign out?',
      signOutWarning(count, options.all) + (options.allDevices ? ' Other devices can only be signed out when a connection is available.' : ''),
      [{ text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: count ? 'Sign out and delete' : 'Sign out', style: 'destructive', onPress: () => resolve(true) }],
      { cancelable: true, onDismiss: () => resolve(false) },
    ));
    if (!confirmed) return false;
    // Delete only these accounts' unconfirmed local operations. Server-backed
    // reviews, receipts and other accounts' queues are never cancelled here.
    for (const scope of scopes) await discardUnsentOperationsForSignOut(scope);
    if (options.allDevices) logoutAllDevices().catch(() => {});
    for (const account of accounts) if (account.refreshToken && account.authSource !== 'HUB') logoutAccount(account.refreshToken).catch(() => {});
    if (options.all) await useAuthStore.getState().logoutAll();
    else if (accountId && accounts.length) await useAuthStore.getState().logoutFromAccount(accountId);
    else await useAuthStore.getState().logout();
    return true;
  } catch {
    Alert.alert('Could not finish signing out', 'Local payment storage could not be updated. Please unlock the device and try again.');
    return false;
  }
}
