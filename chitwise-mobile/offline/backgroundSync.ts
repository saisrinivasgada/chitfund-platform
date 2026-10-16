import { Platform } from 'react-native';
import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { useAuthStore } from '../store/authStore';
import { getStoredAccountScope } from './accountScope';
import { hasOfflineAccess, refreshOfflineAccess, restoreOfflineAccess } from './access';
import { getSyncCounts, hasOfflineDatabase } from './database';
import { synchronizeSavedAccounts } from './syncEngine';

const TASK = 'chitwise-saved-account-sync-v1';
const supported = Platform.OS !== 'web' && process.env.EXPO_PUBLIC_APP_VARIANT !== 'hub';

if (supported && !TaskManager.isTaskDefined(TASK)) {
  TaskManager.defineTask(TASK, async () => {
    try {
      // Background launch must not restore or change the visible login.
      await useAuthStore.getState().loadSavedAccountsForBackground();
      await synchronizeSavedAccounts();
      for (const account of useAuthStore.getState().accounts) {
        if (!account.sessionValid || account.authSource === 'HUB') continue;
        try { await refreshOfflineAccess(getStoredAccountScope(account)); } catch { /* Retry later. */ }
      }
      return BackgroundTask.BackgroundTaskResult.Success;
    } catch {
      // Outbox rows survive worker expiry, locked-device access and network failure.
      return BackgroundTask.BackgroundTaskResult.Failed;
    }
  });
}

let scheduling: Promise<void> = Promise.resolve();
export function updateBackgroundSyncRegistration(): Promise<void> {
  scheduling = scheduling.catch(() => {}).then(async () => {
    if (!supported || !await TaskManager.isAvailableAsync()) return;
    let eligible = false;
    for (const account of useAuthStore.getState().accounts) {
      if (!account.sessionValid || account.authSource === 'HUB') continue;
      const scope = getStoredAccountScope(account);
      await restoreOfflineAccess(scope);
      const pending = await hasOfflineDatabase(scope) ? (await getSyncCounts(scope)).pending : 0;
      if (hasOfflineAccess(scope) || pending > 0) { eligible = true; break; }
    }
    const registered = await TaskManager.isTaskRegisteredAsync(TASK);
    if (eligible && !registered && await BackgroundTask.getStatusAsync() === BackgroundTask.BackgroundTaskStatus.Available) {
      await BackgroundTask.registerTaskAsync(TASK, { minimumInterval: 15 });
    } else if (!eligible && registered) {
      await BackgroundTask.unregisterTaskAsync(TASK);
    }
  });
  return scheduling;
}
