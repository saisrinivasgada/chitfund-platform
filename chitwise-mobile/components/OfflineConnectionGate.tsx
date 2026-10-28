import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import NetInfo, { useNetInfo } from '@react-native-community/netinfo';
import { useRouter, useSegments } from 'expo-router';
import { useAuthStore } from '../store/authStore';
import { useSyncStore } from '../store/syncStore';
import { getAccountScope } from '../offline/accountScope';
import { refreshOfflineAccess } from '../offline/access';
import { useOfflinePresentation } from '../offline/useOfflinePresentation';
import { C } from './ui';

export function OfflineConnectionGate({ children }: { children: ReactNode }) {
  const user = useAuthStore((state) => state.user);
  const network = useNetInfo();
  const segments = useSegments();
  const router = useRouter();
  const { showSync, notSubscribed } = useOfflinePresentation();
  const scope = getAccountScope(user);
  const unreachable = useSyncStore((state) => state.accountScope === scope && state.serverReachable === false);
  const [busy, setBusy] = useState(false);
  const disconnected = network.isConnected === false || network.isInternetReachable === false;
  const blocked = segments[0] === '(app)' && !!user?.tenantId && user.authSource !== 'HUB' && !showSync && (disconnected || unreachable);

  async function retry() {
    if (!scope || busy) return;
    setBusy(true);
    try {
      const connection = await NetInfo.refresh();
      if (connection.isConnected === false || connection.isInternetReachable === false) return;
      await refreshOfflineAccess(scope);
      useSyncStore.getState().setStateForScope(scope, { serverReachable: true });
    } catch { /* Remain on the connection screen until the server responds. */ }
    finally { setBusy(false); }
  }

  return <><View style={{ flex: 1 }} accessibilityElementsHidden={blocked} importantForAccessibility={blocked ? 'no-hide-descendants' : 'auto'}>{children}</View>{blocked && <SafeAreaView accessibilityViewIsModal testID="offline-connection-required" style={{ position: 'absolute', inset: 0, zIndex: 100, backgroundColor: C.gray50, justifyContent: 'center', padding: 28 }}>
    <View style={{ alignItems: 'center', gap: 16 }}>
      <View style={{ width: 80, height: 80, borderRadius: 26, backgroundColor: C.navy50, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name="wifi-outline" size={36} color={C.navy} />
      </View>
      <Text accessibilityRole="header" style={{ color: C.navy, fontSize: 24, fontWeight: '800', textAlign: 'center' }}>{disconnected ? 'No internet connection' : 'Unable to connect'}</Text>
      <Text style={{ color: C.gray600, fontSize: 15, lineHeight: 23, textAlign: 'center' }}>{notSubscribed
        ? 'Your organisation hasn’t subscribed to Offline access & sync. Connect to the internet to continue.'
        : 'Connect to the internet to verify offline access for this account.'}</Text>
      <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={retry} style={{ backgroundColor: C.navy, borderRadius: 14, padding: 16, alignSelf: 'stretch', alignItems: 'center', opacity: busy ? 0.6 : 1 }}>
        {busy ? <ActivityIndicator color={C.white} /> : <Text style={{ color: C.white, fontWeight: '700', fontSize: 15 }}>Try again</Text>}
      </TouchableOpacity>
      <TouchableOpacity accessibilityRole="button" onPress={() => router.push('/(auth)/accounts')} style={{ padding: 12 }}>
        <Text style={{ color: C.navy, fontWeight: '600' }}>Switch account</Text>
      </TouchableOpacity>
    </View>
  </SafeAreaView>}</>;
}
