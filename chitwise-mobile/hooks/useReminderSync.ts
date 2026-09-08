import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { getMyReminders } from '../services/api';
import { scheduleReminderRepeat } from './usePushNotifications';

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
    const data = await getMyReminders({ filter: 'all', page: 0, size: 100 });
    const reminders: any[] = data?.content ?? [];

    const activeIds = new Set<string>();

    for (const r of reminders) {
      // Only reminders with a repeat schedule, no promised date, and not archived
      if (!r.repeatIntervalMinutes || r.promisedDate || r.archived) continue;

      activeIds.add(r.id);

      const body = r.message?.trim()
        ? 'You have a message — tap to view'
        : r.totalAmount > 0
          ? `Outstanding ₹${Number(r.totalAmount).toLocaleString('en-IN')} — tap to view`
          : 'You have a pending payment reminder.';

      await scheduleReminderRepeat(
        r.id,
        r.repeatIntervalMinutes,
        r.reminderTime ?? null,
        'Payment Reminder',
        body,
      );
    }

    // Cancel any scheduled notifications whose reminders are now resolved/archived
    const allKeys = await AsyncStorage.getAllKeys();
    const reminderKeys = allKeys.filter(k => k.startsWith('reminder_notif_'));
    for (const key of reminderKeys) {
      const reminderId = key.replace('reminder_notif_', '');
      if (!activeIds.has(reminderId)) {
        try {
          const notifId = await AsyncStorage.getItem(key);
          if (notifId) await Notifications.cancelScheduledNotificationAsync(notifId);
        } catch {}
        await AsyncStorage.removeItem(key);
      }
    }
  } catch {}
}
