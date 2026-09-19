import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { focusManager, onlineManager, useIsRestoring, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../store/authStore';
import { useSyncStore } from '../store/syncStore';
import { getAccountScope } from './accountScope';
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
  }, [scope, user?.authSource, isRestoring]);

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
      appState.current = next;
    });
    return () => subscription.remove();
  }, [scope, user?.authSource, queryClient, isRestoring]);

  return null;
}
