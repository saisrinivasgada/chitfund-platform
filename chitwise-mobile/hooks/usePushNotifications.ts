import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import * as SecureStore from 'expo-secure-store';
import { registerPushToken, markReminderSeen } from '../services/api';
import { accountStorageId, useAuthStore } from '../store/authStore';
import { scheduleReminderRepeat } from '../utils/reminderNotifications';
export { scheduleReminderRepeat, cancelReminderRepeat } from '../utils/reminderNotifications';

const REGISTERED_PUSH_TOKEN_KEY = 'chitwise_registered_push_token';

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

function getScreenRoute(screen: string, role?: string): string | null {
  const r = role ?? 'MEMBER';
  switch (screen) {
    case 'reminders': return r === 'MEMBER' ? '/(app)/(member)/reminders' : null;
    case 'chits':
      if (r === 'MEMBER') return '/(app)/(member)/chits';
      if (r === 'ADMIN') return '/(app)/(admin)/chits';
      if (r === 'MANAGER') return '/(app)/(manager)/chits';
      return null;
    case 'payments':
      if (r === 'MEMBER') return '/(app)/(member)/payments';
      if (r === 'ADMIN') return '/(app)/(admin)/payments';
      if (r === 'MANAGER') return '/(app)/(manager)/payments';
      return null;
    case 'payouts': return r === 'MEMBER' ? '/(app)/(member)/payouts' : null;
    case 'requests': return r === 'MEMBER' ? '/(app)/(member)/requests' : null;
    case 'tasks': return r === 'STAFF' ? '/(app)/(staff)/index' : null;
    case 'account':
      if (r === 'MEMBER') return '/(app)/(member)/my-account';
      if (r === 'ADMIN') return '/(app)/(admin)/my-account';
      if (r === 'MANAGER') return '/(app)/(manager)/more';
      return null;
    case 'messages':
      if (r === 'MEMBER') return '/(app)/(member)/messages';
      if (r === 'ADMIN') return '/(app)/(admin)/messages';
      if (r === 'MANAGER') return '/(app)/(manager)/messages';
      if (r === 'STAFF') return '/(app)/(staff)/messages';
      return null;
    case 'support':
      if (r === 'MEMBER') return '/(app)/(member)/support';
      if (r === 'ADMIN') return '/(app)/(admin)/support';
      return null;
    default: return null;
  }
}

export function usePushNotifications(isLoggedIn: boolean) {
  const router = useRouter();
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const tokenRef = useRef<string | null>(null);
  const notifListenerRef    = useRef<Notifications.Subscription | null>(null);
  const responseListenerRef = useRef<Notifications.Subscription | null>(null);

  useEffect(() => {
    if (!isLoggedIn) {
      // Auth store revokes the token before clearing the authenticated session.
      tokenRef.current = null;
      return;
    }

    let mounted = true;
    const account = user ? accountStorageId(user.id, user.tenantId, user.authSource ?? 'ORGANIZATION') : null;
    const sameAccount = () => {
      const current = useAuthStore.getState().user;
      return !!account && !!current
        && accountStorageId(current.id, current.tenantId, current.authSource ?? 'ORGANIZATION') === account;
    };
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    async function registerWithRetry(token: string, platform: string, attempt = 1) {
      try {
        await registerPushToken(token, platform);
        if (mounted) await SecureStore.setItemAsync(REGISTERED_PUSH_TOKEN_KEY, token);
      } catch {
        if (mounted && attempt < 3) {
          retryTimer = setTimeout(() => registerWithRetry(token, platform, attempt + 1), 5000 * attempt);
        } else if (mounted) {
          console.warn('[Push] Could not register this device for notifications');
        }
      }
    }

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

      // Register token with our backend
      const platform = Platform.OS === 'ios' ? 'ios' : 'android';
      registerWithRetry(expoPushToken, platform);

      // Listen for notifications received while app is foregrounded
      notifListenerRef.current = Notifications.addNotificationReceivedListener(async (notification) => {
        qc.invalidateQueries({ queryKey: ['m-notifs'] });
        qc.invalidateQueries({ queryKey: ['m-unread'] });
        const data = notification.request.content.data as any;
        if (data?.screen === 'reminders' && data?.reminderId && data?.repeatIntervalMinutes
            && sameAccount() && useAuthStore.getState().user?.role === 'MEMBER') {
          await scheduleReminderRepeat(
            data.reminderId,
            data.repeatIntervalMinutes,
            data.reminderTime,
          );
        }
      });

      // Handle user tapping on a notification (push OR local)
      responseListenerRef.current = Notifications.addNotificationResponseReceivedListener(async (response) => {
        const data = response.notification.request.content.data as any;

        // Reminder deep-link — tap navigates to Reminders tab and opens detail
        if (data?.screen === 'reminders' && data?.reminderId
            && sameAccount() && useAuthStore.getState().user?.role === 'MEMBER') {
          try { await markReminderSeen(data.reminderId); } catch {}

          // Schedule repeat on tap — covers cold-start (app was killed when push arrived)
          if (data.repeatIntervalMinutes) {
            await scheduleReminderRepeat(
              data.reminderId,
              data.repeatIntervalMinutes,
              data.reminderTime,
            );
          }

          try { router.push({ pathname: '/(app)/(member)/reminders', params: { openReminderId: data.reminderId } } as any); } catch {}
          return;
        }

        // Screen-based navigation (screen key sent in push data)
        if (data?.screen) {
          const role = useAuthStore.getState().user?.role;
          const route = getScreenRoute(data.screen, role);
          if (route) {
            try { router.push(route as any); } catch {}
            return;
          }
        }

        // Only role-mapped destinations are accepted from notification data.
      });
    }

    registerAndSubscribe().catch(() => {
      if (mounted) console.warn('[Push] Notification setup failed');
    });

    return () => {
      mounted = false;
      if (retryTimer) clearTimeout(retryTimer);
      notifListenerRef.current?.remove();
      responseListenerRef.current?.remove();
    };
  }, [isLoggedIn, user?.id, qc, router]);
}
