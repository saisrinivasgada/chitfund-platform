import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { focusManager, onlineManager, useIsRestoring, useQueryClient } from '@tanstack/react-query';
import { persistQueryClientSave } from '@tanstack/query-persist-client-core';
import { useAuthStore } from '../store/authStore';
import { useSyncStore } from '../store/syncStore';
import { getAccountScope } from './accountScope';
import { offlinePersistenceOptions } from './queryPersistence';
import { refreshSyncState, synchronizeAccount } from './syncEngine';

export function SyncRuntime() {
  const user = useAuthStore((state) => state.user);
  const queryClient = useQueryClient();
  const isRestoring = useIsRestoring();
  const appState = useRef(AppState.currentState);
  const scope = getAccountScope(user);

  useEffect(() => {
    useSyncStore.getState().resetForScope(scope);
    if (!scope || user?.authSource === 'HUB' || isRestoring) return;

    refreshSyncState(scope).catch((error) => {
      useSyncStore.getState().setStateForScope(scope, {
        status: 'error',
        message: error instanceof Error ? error.message : 'Offline storage is unavailable',
      });
    });

    // Sync immediately on every login / account switch so pending offline payments
    // upload without requiring a manual tap.
    synchronizeAccount(scope, queryClient).catch(() => {});
  }, [scope, user?.authSource, isRestoring, queryClient]);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const isOnline = state.isConnected === true && state.isInternetReachable !== false;
      onlineManager.setOnline(isOnline);
      if (!scope || user?.authSource === 'HUB' || isRestoring) return;
      useSyncStore.getState().setStateForScope(scope, { isOnline });
      if (isOnline) {
        synchronizeAccount(scope, queryClient).catch((error) => {
          useSyncStore.getState().setStateForScope(scope, {
            status: 'error',
            message: error instanceof Error ? error.message : 'Synchronization failed',
          });
        });
      } else {
        refreshSyncState(scope, false).catch(() => {});
      }
    });
    return unsubscribe;
  }, [scope, user?.authSource, queryClient, isRestoring]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next: AppStateStatus) => {
      focusManager.setFocused(next === 'active');
      if (appState.current.match(/inactive|background/) && next === 'active' && scope && user?.authSource !== 'HUB' && !isRestoring) {
        synchronizeAccount(scope, queryClient).catch(() => {});
      }
      // persistQueryClient writes to disk on a throttle, so a change made just
      // before the OS kills the app (backgrounded, then swiped away or reaped)
      // can be lost on the next cold start. iOS/Android always deliver
      // inactive/background before real termination — except a hard crash,
      // which is out of scope here — so flushing synchronously at that point
      // closes the race instead of waiting for the throttle window.
      if (next.match(/inactive|background/) && appState.current === 'active' && scope && user?.authSource !== 'HUB' && !isRestoring) {
        const { persister, buster, dehydrateOptions } = offlinePersistenceOptions(scope);
        persistQueryClientSave({ queryClient, persister, buster, dehydrateOptions }).catch(() => {});
      }
      appState.current = next;
    });
    return () => subscription.remove();
  }, [scope, user?.authSource, queryClient, isRestoring]);

  // NetInfo only flips when the device's WiFi/cellular link itself changes —
  // it stays "connected" if just the backend is unreachable (outage, restart,
  // local dev server down), so the reconnect listener above never fires and a
  // failed query is stuck showing stale/empty data until something else nudges
  // it. This keeps retrying quietly in the background until the backend is
  // actually reachable again, without waiting for a real network transition,
  // app foreground, or a manual "tap to sync".
  //
  // Two independent things can be stuck this way: the offline mutation queue
  // (reflected in useSyncStore's status) and plain useQuery reads that failed
  // and have no queue entry at all (e.g. a member-detail screen opened while
  // the backend was down) — useSyncStore only tracks the former, so both are
  // checked here.
  useEffect(() => {
    if (!scope || user?.authSource === 'HUB') return;
    const interval = setInterval(() => {
      if (isRestoring) return;
      const { status, accountScope } = useSyncStore.getState();
      if (accountScope !== scope) return;
      if (status === 'error' || status === 'pending' || status === 'offline') {
        synchronizeAccount(scope, queryClient).catch(() => {});
        return;
      }
      const hasErroredQuery = queryClient
        .getQueryCache()
        .getAll()
        .some((q) => q.state.status === 'error' && q.getObserversCount() > 0);
      if (hasErroredQuery) {
        queryClient.invalidateQueries({ refetchType: 'active' }).catch(() => {});
      }
    }, 20_000);
    return () => clearInterval(interval);
  }, [scope, user?.authSource, queryClient, isRestoring]);

  return null;
}
