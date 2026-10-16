import { runAccountTasks } from '../../shared/offline/scheduling';
import type { QueryClient } from '@tanstack/react-query';
import NetInfo from '@react-native-community/netinfo';
import { getAccountScope, getStoredAccountScope } from './accountScope';
import {
  getLastSyncedAt,
  hasOfflineDatabase,
  getReadyOperations,
  getSyncCounts,
  makeRetryableOperationsReady,
  pruneCompletedOperations,
  recoverInterruptedOperations,
  setLastSyncedAt,
} from './database';
import { processPaymentOperation } from './paymentQueue';
import { processStaffOperation } from './staffQueue';
import { useAuthStore } from '../store/authStore';
import { useSyncStore } from '../store/syncStore';
import { refreshReviewedPayments } from './paymentReviews';

const activeSyncs = new Map<string, Promise<void>>();

function deriveStatus(isOnline: boolean, counts: { pending: number; paused: number; conflicts: number; failed: number }) {
  if (!isOnline) return 'offline' as const;
  if (counts.conflicts > 0 || counts.failed > 0) return 'conflict' as const;
  if (counts.paused > 0) return 'access-required' as const;
  if (counts.pending > 0) return 'pending' as const;
  return 'synced' as const;
}

export async function refreshSyncState(accountScope: string, online?: boolean): Promise<void> {
  if (!await hasOfflineDatabase(accountScope)) {
    const network = online == null ? await NetInfo.fetch() : null;
    const isOnline = online ?? (network?.isConnected === true && network?.isInternetReachable !== false);
    useSyncStore.getState().setStateForScope(accountScope, {
      isOnline, pendingCount: 0, conflictCount: 0, failedCount: 0,
      status: isOnline ? 'synced' : 'offline', lastSyncedAt: null,
    });
    return;
  }
  const [counts, lastSyncedAt, network] = await Promise.all([
    getSyncCounts(accountScope),
    getLastSyncedAt(accountScope),
    online == null ? NetInfo.fetch() : Promise.resolve(null),
  ]);
  const isOnline = online ?? (network?.isConnected === true && network?.isInternetReachable !== false);
  useSyncStore.getState().setStateForScope(accountScope, {
    isOnline,
    pendingCount: counts.pending,
    conflictCount: counts.conflicts,
    failedCount: counts.failed,
    lastSyncedAt,
    status: deriveStatus(isOnline, counts),
    message: counts.paused ? 'Saved payments are preserved while account access is reviewed'
      : counts.conflicts || counts.failed ? 'One or more items need review' : null,
  });
}

async function doSynchronize(accountScope: string, queryClient?: QueryClient, deadline = Date.now() + 60_000): Promise<void> {
  const network = await NetInfo.fetch();
  const isOnline = network.isConnected === true && network.isInternetReachable !== false;
  if (!isOnline) {
    await refreshSyncState(accountScope, false);
    return;
  }

  useSyncStore.getState().setStateForScope(accountScope, { status: 'syncing', isOnline: true, message: null });
  await recoverInterruptedOperations(accountScope);
  const confirmedReviews = await refreshReviewedPayments(accountScope, false, deadline);
  if (confirmedReviews && queryClient && getAccountScope(useAuthStore.getState().user) === accountScope) {
    await queryClient.invalidateQueries({ refetchType: 'active' });
  }
  const operations = await getReadyOperations(accountScope);
  if (!operations.length) {
    await refreshSyncState(accountScope, true);
    return;
  }
  let authRequired = false;
  for (const operation of operations) {
    if (Date.now() >= deadline) break;
    const result = operation.action === 'RECORD_PAYMENT'
      ? await processPaymentOperation(operation)
      : await processStaffOperation(operation);
    if (result.kind === 'auth-required') {
      authRequired = true;
      break;
    }
    if (result.kind === 'retryable' || result.kind === 'access-required') break;
  }

  if (!authRequired) {
    // Active cached screens refresh after queued writes so their server state is
    // authoritative. Inactive screens retain their encrypted last-known data.
    if (queryClient && getAccountScope(useAuthStore.getState().user) === accountScope) {
      await queryClient.invalidateQueries({ refetchType: 'active' });
    }
    const counts = await getSyncCounts(accountScope);
    if (counts.pending === 0 && counts.conflicts === 0 && counts.failed === 0) {
      await setLastSyncedAt(accountScope, Date.now());
    }
    await pruneCompletedOperations(accountScope);
  }
  await refreshSyncState(accountScope, true);
  if (authRequired) {
    useSyncStore.getState().setStateForScope(accountScope, {
      status: 'auth-required',
      message: 'Login again to sync saved changes',
    });
  }
}

export function synchronizeAccount(accountScope: string, queryClient?: QueryClient, deadline = Date.now() + 60_000): Promise<void> {
  const running = activeSyncs.get(accountScope);
  if (running) return running;
  const promise = doSynchronize(accountScope, queryClient, deadline).finally(() => activeSyncs.delete(accountScope));
  activeSyncs.set(accountScope, promise);
  return promise;
}

/** Delivery of saved work is independent of current add-on access and visible account. */
export async function synchronizeSavedAccounts(queryClient?: QueryClient, deadline = Date.now() + 60_000): Promise<void> {
  await runAccountTasks(useAuthStore.getState().accounts.filter((account) => account.sessionValid && account.authSource !== 'HUB'), async (account) => {
    const scope = getStoredAccountScope(account);
    if (!scope) return;
    try {
      if (!await hasOfflineDatabase(scope)) return;
      const counts = await getSyncCounts(scope);
      if (!counts.pending && !counts.conflicts) return;
      const visible = getAccountScope(useAuthStore.getState().user) === scope;
      await synchronizeAccount(scope, visible ? queryClient : undefined, deadline);
    } catch {
      // A failed account must not prevent another organisation's work syncing.
    }
  }, { deadline });
}

export async function syncCurrentAccount(queryClient: QueryClient): Promise<void> {
  const scope = getAccountScope(useAuthStore.getState().user);
  if (!scope) return;
  // A visible user action means retry now; background retries continue to use
  // exponential backoff to avoid hammering an unhealthy server.
  await makeRetryableOperationsReady(scope);
  await synchronizeSavedAccounts(queryClient);
}
