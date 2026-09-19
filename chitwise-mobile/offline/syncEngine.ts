import type { QueryClient } from '@tanstack/react-query';
import NetInfo from '@react-native-community/netinfo';
import { getAccountScope } from './accountScope';
import {
  getLastSyncedAt,
  getReadyOperations,
  getSyncCounts,
  makeRetryableOperationsReady,
  pruneCompletedOperations,
  recoverInterruptedOperations,
  setLastSyncedAt,
} from './database';
import { processPaymentOperation } from './paymentQueue';
import { useAuthStore } from '../store/authStore';
import { useSyncStore } from '../store/syncStore';

const activeSyncs = new Map<string, Promise<void>>();

function deriveStatus(isOnline: boolean, counts: { pending: number; conflicts: number; failed: number }) {
  if (!isOnline) return 'offline' as const;
  if (counts.conflicts > 0 || counts.failed > 0) return 'conflict' as const;
  if (counts.pending > 0) return 'pending' as const;
  return 'synced' as const;
}

export async function refreshSyncState(accountScope: string, online?: boolean): Promise<void> {
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
    message: counts.conflicts || counts.failed ? 'One or more items need review' : null,
  });
}

async function doSynchronize(accountScope: string, queryClient: QueryClient): Promise<void> {
  const network = await NetInfo.fetch();
  const isOnline = network.isConnected === true && network.isInternetReachable !== false;
  if (!isOnline) {
    await refreshSyncState(accountScope, false);
    return;
  }

  useSyncStore.getState().setStateForScope(accountScope, { status: 'syncing', isOnline: true, message: null });
  await recoverInterruptedOperations(accountScope);
  const operations = await getReadyOperations(accountScope);
  let authRequired = false;
  for (const operation of operations) {
    const result = await processPaymentOperation(operation);
    if (result.kind === 'auth-required') {
      authRequired = true;
      break;
    }
  }

  if (!authRequired) {
    // Active cached screens refresh after queued writes so their server state is
    // authoritative. Inactive screens retain their encrypted last-known data.
    await queryClient.invalidateQueries({ refetchType: 'active' });
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

export function synchronizeAccount(accountScope: string, queryClient: QueryClient): Promise<void> {
  const running = activeSyncs.get(accountScope);
  if (running) return running;
  const promise = doSynchronize(accountScope, queryClient).finally(() => activeSyncs.delete(accountScope));
  activeSyncs.set(accountScope, promise);
  return promise;
}

export async function syncCurrentAccount(queryClient: QueryClient): Promise<void> {
  const scope = getAccountScope(useAuthStore.getState().user);
  if (!scope) return;
  // A visible user action means retry now; background retries continue to use
  // exponential backoff to avoid hammering an unhealthy server.
  await makeRetryableOperationsReady(scope);
  await synchronizeAccount(scope, queryClient);
}
