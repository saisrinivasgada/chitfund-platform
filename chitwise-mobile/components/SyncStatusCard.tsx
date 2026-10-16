import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Modal, Pressable, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { C } from './ui';
import { syncCurrentAccount } from '../offline/syncEngine';
import { prepareOfflineData, usePreparationStore } from '../offline/preparation';
import { useOfflineAccessStore } from '../offline/access';
import { useAuthStore } from '../store/authStore';
import { useSyncStore } from '../store/syncStore';

function savedTime(value: number | null | undefined) {
  return value ? new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : 'Waiting for the first sync';
}

export function SyncStatusCard({ compact = false }: { compact?: boolean }) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const state = useSyncStore();
  const role = useAuthStore((store) => store.user?.role);
  const preparation = usePreparationStore((store) => state.accountScope ? store.byScope[state.accountScope] : undefined);
  const access = useOfflineAccessStore((store) => state.accountScope ? store.accounts[state.accountScope] : undefined);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pulse = useRef(new Animated.Value(1)).current;
  const attention = state.conflictCount + state.failedCount;
  const preparing = preparation?.status === 'preparing' && state.isOnline;
  const syncing = busy || state.status === 'syncing' || preparing;
  const accessNeeded = state.status === 'auth-required' || state.status === 'access-required';
  const title = attention || state.status === 'error' ? 'Needs attention'
    : accessNeeded ? 'Sign-in needed'
    : state.pendingCount ? `${state.pendingCount} saved · waiting to sync`
    : !state.isOnline ? (preparation?.lastCompleteAt ? 'Offline · data saved' : 'Offline')
    : syncing ? 'Syncing your data'
    : preparation?.status === 'paused' ? 'Saved data · refresh paused'
    : access?.enabled ? 'Up to date' : 'Connected';
  const color = attention || state.status === 'error' ? '#B45309'
    : accessNeeded || !state.isOnline || state.pendingCount || preparation?.status === 'paused' ? '#A16207'
    : syncing ? '#2563EB' : '#16805D';

  useEffect(() => { setOpen(false); setError(''); setBusy(false); }, [state.accountScope]);
  useEffect(() => {
    if (!syncing) { pulse.stopAnimation(); pulse.setValue(1); return; }
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 0.35, duration: 650, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1, duration: 650, useNativeDriver: true }),
    ]));
    animation.start(); return () => animation.stop();
  }, [pulse, syncing]);

  async function synchronize() {
    if (accessNeeded) { setOpen(false); router.push('/(auth)/login'); return; }
    const scope = state.accountScope;
    if (!scope || !state.isOnline || busy) return;
    setBusy(true); setError('');
    try {
      await syncCurrentAccount(queryClient);
      await prepareOfflineData(scope, { force: true, deadline: Date.now() + 25_000 });
    } catch {
      if (useSyncStore.getState().accountScope === scope) setError('Connection interrupted. Saved collections are safe; syncing will resume automatically.');
    } finally { if (useSyncStore.getState().accountScope === scope) setBusy(false); }
  }

  const dataTitle = !access?.enabled ? 'Offline access' : preparation?.status === 'ready' ? 'Available offline'
    : preparation?.lastCompleteAt ? 'Saved copy available'
    : preparing ? 'Downloading for offline use' : 'Download will resume';
  const progress = preparation?.total ? Math.min(1, (preparation.detailsDone ?? 0) / preparation.total) : 0;

  return <>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Sync status: ${title}. Open sync details.`}
      accessibilityHint="Shows saved collections, offline downloads and a sync button"
      activeOpacity={0.7} onPress={() => setOpen(true)}
      style={{ flexDirection: 'row', alignItems: 'center', minHeight: compact ? 38 : 48, paddingHorizontal: 13,
        backgroundColor: 'rgba(255,255,255,0.5)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.8)',
        marginBottom: 16, gap: 9 }}>
      <Animated.View style={{ opacity: pulse, width: 7, height: 7, borderRadius: 4, backgroundColor: color }} />
      <Text style={{ flex: 1, minWidth: 0, color, fontSize: 12, fontWeight: '600' }} numberOfLines={1}>{title}</Text>
      <Text style={{ color: '#718096', fontSize: 11 }}>Details</Text>
      <Text style={{ color: '#94A3B8', fontSize: 18 }}>›</Text>
    </TouchableOpacity>

    <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable accessibilityLabel="Dismiss sync details" onPress={() => setOpen(false)} style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(15,23,42,0.35)' }} />
        <View style={{ backgroundColor: '#F8FAFC', borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 24, paddingBottom: 38, maxHeight: '86%' }}>
          <View style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: '#CBD5E1', marginBottom: 22 }} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
            <Text style={{ fontSize: 22, fontWeight: '800', color: C.navy }}>Sync & offline data</Text>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close sync details" onPress={() => setOpen(false)} hitSlop={10}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: '#64748B' }}>Done</Text>
            </TouchableOpacity>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 14 }}>
            <View style={{ padding: 18, borderRadius: 18, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', gap: 9 }}>
              <Text style={{ color: C.navy, fontSize: 15, fontWeight: '700' }}>Saved collections</Text>
              <Text style={{ color: '#475569', fontSize: 13, lineHeight: 20 }}>{state.pendingCount
                ? `${state.pendingCount} collection${state.pendingCount === 1 ? ' is' : 's are'} saved on this device and waiting to sync.`
                : 'No collections waiting to upload.'}</Text>
              {!!attention && <TouchableOpacity onPress={() => { setOpen(false); router.push((role === 'STAFF' ? '/(app)/(staff)' : role === 'MANAGER' ? '/(app)/(manager)/pickups' : '/(app)/(admin)/payments?tab=Record%20Payment') as any); }}>
                <Text style={{ color: '#B45309', fontSize: 13, fontWeight: '600' }}>{attention} saved collection{attention === 1 ? '' : 's'} need review →</Text>
              </TouchableOpacity>}
              <Text style={{ color: '#64748B', fontSize: 12, lineHeight: 18 }}>Saved collections stay protected until the server confirms them, even after your offline recording access expires.</Text>
              <Text style={{ color: '#94A3B8', fontSize: 11 }}>Last collection sync · {savedTime(state.lastSyncedAt)}</Text>
            </View>
            <View style={{ padding: 18, borderRadius: 18, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', gap: 10 }}>
              <Text style={{ color: C.navy, fontSize: 15, fontWeight: '700' }}>{dataTitle}</Text>
              <Text style={{ color: '#475569', fontSize: 13, lineHeight: 20 }}>{!access?.enabled ? (access ? 'Offline access is not enabled for this organisation. You can use the app while connected. Previously saved collections remain protected.' : 'Checking offline availability for this account.') : preparation?.status === 'ready'
                ? 'Your downloaded chits, members and payment records are available when the connection drops.'
                : preparation?.lastCompleteAt ? 'You can use your saved data while the refresh waits. Remaining downloads resume automatically.'
                : 'Keep the app connected for the first download. Interrupted downloads continue from where they stopped.'}</Text>
              {!!preparation && <Text style={{ color: '#64748B', fontSize: 12 }}>{preparation.membersCount ?? 0} members · {preparation.chitsCount ?? 0} chits · {preparation.batchesCount ?? 0} payments downloaded</Text>}
              {preparation?.status !== 'ready' && !!preparation?.total && <View>
                <View style={{ height: 5, borderRadius: 3, backgroundColor: '#E2E8F0', overflow: 'hidden' }}>
                  <View style={{ height: 5, width: `${progress * 100}%`, borderRadius: 3, backgroundColor: '#53779C' }} />
                </View>
                <Text style={{ color: '#94A3B8', fontSize: 11, marginTop: 6 }}>{preparation.detailsDone ?? 0} of {preparation.total} related records saved</Text>
              </View>}
              <Text style={{ color: '#94A3B8', fontSize: 11 }}>Last complete download · {savedTime(preparation?.lastCompleteAt)}</Text>
            </View>
            {!state.isOnline && <Text style={{ color: '#A16207', fontSize: 13 }}>You’re offline. Syncing resumes when a connection is available.</Text>}
            {!!error && <Text accessibilityRole="alert" style={{ color: '#B45309', fontSize: 13 }}>{error}</Text>}
            <TouchableOpacity accessibilityRole="button" disabled={busy || (!state.isOnline && !accessNeeded)} onPress={synchronize}
              style={{ backgroundColor: busy || (!state.isOnline && !accessNeeded) ? '#CBD5E1' : C.navy, borderRadius: 14,
                padding: 16, alignItems: 'center', marginTop: 4, flexDirection: 'row', justifyContent: 'center', gap: 9 }}>
              {busy && <ActivityIndicator color="#FFFFFF" size="small" />}
              <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '700' }}>{accessNeeded ? 'Sign in to sync' : busy ? 'Syncing…' : 'Sync now'}</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  </>;
}
