import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getMyReminders } from '../services/api';
import { scheduleReminderRepeat, cancelReminderRepeat } from '../utils/reminderNotifications';
import { accountStorageId, useAuthStore } from '../store/authStore';

export function useReminderSync() {
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    // Sync on mount
    syncReminderNotifications();

    // Re-sync every time app comes to foreground so archived reminders
    // get their local notifications cancelled promptly (even if admin
    // archived the reminder while the app was in the background).
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (appState.current.match(/inactive|background/) && next === 'active') {
        syncReminderNotifications();
      }
      appState.current = next;
    });

    return () => sub.remove();
  }, []);
}

async function syncReminderNotifications() {
  try {
    const user = useAuthStore.getState().user;
    if (!user || user.role !== 'MEMBER') return;
    const owner = accountStorageId(user.id, user.tenantId, user.authSource ?? 'ORGANIZATION');
    const data = await getMyReminders({ filter: 'all', page: 0, size: 100 });
    const current = useAuthStore.getState().user;
    if (!current || accountStorageId(current.id, current.tenantId, current.authSource ?? 'ORGANIZATION') !== owner) return;
    const reminders: any[] = data?.content ?? [];

    const activeIds = new Set<string>();

    for (const r of reminders) {
      const activeUser = useAuthStore.getState().user;
      if (!activeUser || accountStorageId(activeUser.id, activeUser.tenantId, activeUser.authSource ?? 'ORGANIZATION') !== owner) return;
      // Only reminders with a repeat schedule, no promised date, and not archived
      if (!r.repeatIntervalMinutes || r.promisedDate || r.archived) continue;

      activeIds.add(r.id);

      await scheduleReminderRepeat(
        r.id,
        r.repeatIntervalMinutes,
        r.reminderTime ?? null,
      );
    }

    // Cancel any scheduled notifications whose reminders are now resolved/archived
    const ownerStillActive = useAuthStore.getState().user;
    if (!ownerStillActive || accountStorageId(ownerStillActive.id, ownerStillActive.tenantId,
      ownerStillActive.authSource ?? 'ORGANIZATION') !== owner) return;
    const allKeys = await AsyncStorage.getAllKeys();
    const reminderKeys = allKeys.filter(k => k.startsWith('reminder_notif_'));
    for (const key of reminderKeys) {
      const activeUser = useAuthStore.getState().user;
      if (!activeUser || accountStorageId(activeUser.id, activeUser.tenantId,
        activeUser.authSource ?? 'ORGANIZATION') !== owner) return;
      const reminderId = key.replace('reminder_notif_', '');
      if (!activeIds.has(reminderId)) {
        await cancelReminderRepeat(reminderId);
      }
    }
  } catch {}
}
