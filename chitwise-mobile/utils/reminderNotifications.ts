import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';

const PREFIX = 'reminder_notif_';
let generation = 0;

export async function scheduleReminderRepeat(
  reminderId: string,
  repeatIntervalMinutes: number | string,
  reminderTime: string | null | undefined,
) {
  const startedIn = generation;
  const key = `${PREFIX}${reminderId}`;
  const existing = await AsyncStorage.getItem(key);
  if (existing || startedIn !== generation) return;

  let trigger: any;
  if (reminderTime && Number(repeatIntervalMinutes) === 1440) {
    const [hour, minute] = reminderTime.split(':').map(Number);
    trigger = { hour, minute, repeats: true };
  } else {
    trigger = { seconds: Number(repeatIntervalMinutes) * 60, repeats: true };
  }

  try {
    const localId = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'ChitWise reminder',
        body: 'Open ChitWise to view your reminder.',
        data: { screen: 'reminders', reminderId },
      }, trigger,
    });
    if (startedIn !== generation) {
      await Notifications.cancelScheduledNotificationAsync(localId);
      return;
    }
    await AsyncStorage.setItem(key, localId);
    if (startedIn !== generation) {
      await Notifications.cancelScheduledNotificationAsync(localId);
      await AsyncStorage.removeItem(key);
    }
  } catch {
    // A failed local schedule does not change the server's reminder.
  }
}

export async function cancelReminderRepeat(reminderId: string) {
  const key = `${PREFIX}${reminderId}`;
  try {
    const localId = await AsyncStorage.getItem(key);
    if (localId) await Notifications.cancelScheduledNotificationAsync(localId);
    await AsyncStorage.removeItem(key);
  } catch {
    // Keep a failed cancellation's key so the next cleanup can retry it.
  }
}

export async function cancelAllReminderRepeats() {
  generation += 1;
  let allCancelled = false;
  try {
    // This app only schedules local payment reminders. The OS call also catches
    // a reminder created just before its AsyncStorage key was written.
    await Notifications.cancelAllScheduledNotificationsAsync();
    allCancelled = true;
  } catch {
    // Try each saved ID when the OS-wide cancellation is unavailable.
  }
  try {
    const keys = (await AsyncStorage.getAllKeys()).filter((key) => key.startsWith(PREFIX));
    if (allCancelled) {
      if (keys.length) await AsyncStorage.multiRemove(keys);
    } else {
      for (const key of keys) await cancelReminderRepeat(key.slice(PREFIX.length));
    }
  } catch {
    // Sign-out must still remove credentials if the OS notification service fails.
  }
}
