import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { registerPushToken, unregisterPushToken, markReminderSeen } from '../services/api';

// How the app behaves when a push arrives while it is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export function usePushNotifications(isLoggedIn: boolean) {
  const router = useRouter();
  const tokenRef = useRef<string | null>(null);
  const notifListenerRef    = useRef<Notifications.Subscription | null>(null);
  const responseListenerRef = useRef<Notifications.Subscription | null>(null);

  useEffect(() => {
    if (!isLoggedIn) {
      // On logout, unregister this device token
      if (tokenRef.current) {
        unregisterPushToken(tokenRef.current);
        tokenRef.current = null;
      }
      return;
    }

    let mounted = true;

    async function registerAndSubscribe() {
      // Push notifications are only available on physical devices
      if (!Device.isDevice) {
        console.log('[Push] Skipping — running on simulator/emulator');
        return;
      }

      // Request permission
      const { status: existing } = await Notifications.getPermissionsAsync();
      let finalStatus = existing;
      if (existing !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      if (finalStatus !== 'granted') {
        console.log('[Push] Permission not granted');
        return;
      }

      // On Android, create a notification channel
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'ChitWise Notifications',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#1E3A5F',
        });
      }

      // Get the Expo push token — projectId is required for EAS builds
      const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
      const tokenData = await Notifications.getExpoPushTokenAsync(
        projectId ? { projectId } : undefined
      );
      if (!mounted) return;

      const expoPushToken = tokenData.data;
      tokenRef.current = expoPushToken;
      console.log('[Push] Expo push token:', expoPushToken);

      // Register token with our backend
      const platform = Platform.OS === 'ios' ? 'ios' : 'android';
      await registerPushToken(expoPushToken, platform);

      // Listen for notifications received while app is foregrounded
      notifListenerRef.current = Notifications.addNotificationReceivedListener(async (notification) => {
        const data = notification.request.content.data as any;
        if (data?.screen === 'reminders' && data?.reminderId && data?.repeatIntervalMinutes) {
          await scheduleReminderRepeat(
            data.reminderId,
            data.repeatIntervalMinutes,
            data.reminderTime,
            notification.request.content.title ?? 'Payment Reminder',
            notification.request.content.body ?? 'You have a pending payment reminder.',
          );
        }
      });

      // Handle user tapping on a notification (push OR local)
      responseListenerRef.current = Notifications.addNotificationResponseReceivedListener(async (response) => {
        const data = response.notification.request.content.data as any;

        // Reminder deep-link — tap navigates to Reminders tab and opens detail
        if (data?.screen === 'reminders' && data?.reminderId) {
          try { await markReminderSeen(data.reminderId); } catch {}

          // Schedule repeat on tap — covers cold-start (app was killed when push arrived)
          if (data.repeatIntervalMinutes) {
            await scheduleReminderRepeat(
              data.reminderId,
              data.repeatIntervalMinutes,
              data.reminderTime,
              response.notification.request.content.title ?? 'Payment Reminder',
              response.notification.request.content.body ?? 'You have a pending payment reminder.',
            );
          }

          try { router.push({ pathname: '/(app)/(member)/reminders', params: { openReminderId: data.reminderId } } as any); } catch {}
          return;
        }

        const link: string | undefined = data?.link;
        if (link) {
          try { router.push(link as any); } catch {}
        }
      });
    }

    registerAndSubscribe();

    return () => {
      mounted = false;
      notifListenerRef.current?.remove();
      responseListenerRef.current?.remove();
    };
  }, [isLoggedIn]);
}

// ── Shared helper — schedule a local repeating notification for a reminder ─────

export async function scheduleReminderRepeat(
  reminderId: string,
  repeatIntervalMinutes: number | string,
  reminderTime: string | null | undefined,
  title: string,
  body: string,
) {
  const key = `reminder_notif_${reminderId}`;
  const existing = await AsyncStorage.getItem(key);
  if (existing) return; // already scheduled

  const content = {
    title,
    body,
    data: { screen: 'reminders', reminderId },
  };

  let trigger: any;
  if (reminderTime && Number(repeatIntervalMinutes) === 1440) {
    const [hour, minute] = reminderTime.split(':').map(Number);
    trigger = { hour, minute, repeats: true };
  } else {
    trigger = { seconds: Number(repeatIntervalMinutes) * 60, repeats: true };
  }

  try {
    const localId = await Notifications.scheduleNotificationAsync({ content, trigger });
    await AsyncStorage.setItem(key, localId);
  } catch {}
}

export async function cancelReminderRepeat(reminderId: string) {
  const key = `reminder_notif_${reminderId}`;
  try {
    const notifId = await AsyncStorage.getItem(key);
    if (notifId) await Notifications.cancelScheduledNotificationAsync(notifId);
  } catch {}
  await AsyncStorage.removeItem(key);
}
