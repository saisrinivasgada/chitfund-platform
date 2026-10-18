import { useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { hashKey, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { ActivityIndicator, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { createReadViewObserver } from '../../shared/offline/readViewState';
import { useOfflinePresentation } from '../offline/useOfflinePresentation';
import { Button, C } from './ui';

export function ReadDataBoundary({ queryKeys, label, children, compact = false }: { queryKeys: QueryKey[]; label: string; children: ReactNode; compact?: boolean }) {
  const client = useQueryClient();
  const signature = JSON.stringify(queryKeys.map(hashKey));
  const observer = useMemo(() => createReadViewObserver(client, JSON.parse(signature)), [client, signature]);
  const state = useSyncExternalStore(observer.subscribe, observer.getSnapshot, observer.getSnapshot);
  const { showSync } = useOfflinePresentation();
  const [busy, setBusy] = useState(false);
  if (state === 'ready') return <>{children}</>;
  if (compact) return <Text accessibilityLabel={`${label} ${state === 'loading' ? 'loading' : 'unavailable'}`} style={{ fontSize: 11, color: C.gray500 }}>{state === 'loading' ? '…' : state === 'restricted' ? 'Access needed' : 'Unavailable'}</Text>;
  if (state === 'loading') return <View style={{ padding: 32, alignItems: 'center', gap: 12 }}>
    <ActivityIndicator color={C.navy} /><Text style={{ color: C.gray500 }}>Loading {label.toLowerCase()}…</Text>
  </View>;
  return <View testID="read-unavailable" accessibilityRole="alert" style={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 28, gap: 16, backgroundColor: C.gray50 }}>
    <View style={{ padding: 18, borderRadius: 24, backgroundColor: C.navy50 }}><Ionicons name="cloud-download-outline" size={34} color={C.navy} /></View>
    <Text style={{ fontSize: 21, fontWeight: '800', color: C.navy, textAlign: 'center' }}>{label} unavailable</Text>
    <Text style={{ fontSize: 14, lineHeight: 22, color: C.gray600, textAlign: 'center' }}>{state === 'restricted'
      ? 'Connect to verify access and refresh this information before continuing.'
      : showSync ? 'This information has not finished downloading on this device. Connect to continue the download.'
      : 'We could not load this information. Check your connection and try again.'}</Text>
    <Button label="Try again" loading={busy} onPress={async () => {
      setBusy(true);
      try { await observer.retry(); } catch { /* The notice stays until the read succeeds. */ }
      finally { setBusy(false); }
    }} />
  </View>;
}
