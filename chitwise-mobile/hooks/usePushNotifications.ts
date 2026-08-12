import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import { useRouter } from 'expo-router';
import { registerPushToken, unregisterPushToken } from '../services/api';

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

      // Listen for notifications received while app is foregrounded (already shown by handler above)
      notifListenerRef.current = Notifications.addNotificationReceivedListener(notification => {
        console.log('[Push] Received in foreground:', notification.request.content.title);
      });

      // Handle user tapping on a notification
      responseListenerRef.current = Notifications.addNotificationResponseReceivedListener(response => {
        const data = response.notification.request.content.data as any;
        const link: string | undefined = data?.link;
        if (link) {
          // Map backend link strings to Expo Router paths
          try {
            router.push(link as any);
          } catch {
            // Ignore invalid routes
          }
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
