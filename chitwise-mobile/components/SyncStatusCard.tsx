import { Alert, Text, TouchableOpacity, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { C } from './ui';
import { syncCurrentAccount } from '../offline/syncEngine';
import { useSyncStore } from '../store/syncStore';

function relativeTime(value: number | null): string {
  if (!value) return 'Not synced on this device yet';
  const seconds = Math.max(0, Math.round((Date.now() - value) / 1000));
  if (seconds < 10) return 'Synced just now';
  if (seconds < 60) return `Synced ${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `Synced ${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Synced ${hours}h ago`;
  return `Last synced ${new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}`;
}

export function SyncStatusCard({ compact = false }: { compact?: boolean }) {
  const queryClient = useQueryClient();
  const state = useSyncStore();

  const visual = (() => {
    if (state.status === 'syncing') return { icon: '↻', title: 'Syncing…', color: C.navy, background: C.navy50 };
    if (state.status === 'offline') return { icon: '●', title: 'Offline', color: '#92400E', background: '#FFFBEB' };
    if (state.status === 'conflict' || state.status === 'error') return { icon: '!', title: 'Needs attention', color: '#991B1B', background: '#FEF2F2' };
    if (state.status === 'auth-required') return { icon: '!', title: 'Login required to sync', color: '#991B1B', background: '#FEF2F2' };
    if (state.pendingCount > 0 || state.status === 'pending') return { icon: '↑', title: `${state.pendingCount} item${state.pendingCount === 1 ? '' : 's'} waiting to sync`, color: '#92400E', background: '#FFFBEB' };
    return { icon: '✓', title: 'All data synced', color: C.green, background: '#F0FDF4' };
  })();

  const detail = state.status === 'offline' && state.pendingCount > 0
    ? `${state.pendingCount} change${state.pendingCount === 1 ? '' : 's'} safely stored on this device`
    : state.conflictCount + state.failedCount > 0
      ? `${state.conflictCount + state.failedCount} operation${state.conflictCount + state.failedCount === 1 ? '' : 's'} require review`
      : state.message ?? relativeTime(state.lastSyncedAt);

  async function handlePress() {
    if (!state.isOnline) {
      Alert.alert('Offline', `${relativeTime(state.lastSyncedAt)}. Saved changes will sync automatically when internet returns.`);
      return;
    }
    try {
      await syncCurrentAccount(queryClient);
    } catch (error) {
      Alert.alert('Sync failed', error instanceof Error ? error.message : 'Please try again');
    }
  }

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={`${visual.title}. ${detail}. Tap to sync now.`}
      activeOpacity={0.82}
      onPress={handlePress}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 10,
        backgroundColor: visual.background, borderRadius: 12,
        paddingHorizontal: 12, paddingVertical: compact ? 9 : 12,
        marginBottom: compact ? 10 : 16,
        borderWidth: 1, borderColor: `${visual.color}33`,
      }}
    >
      <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: `${visual.color}18`, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: visual.color, fontSize: 15, fontWeight: '900' }}>{visual.icon}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color: visual.color, fontSize: 13, fontWeight: '800' }} numberOfLines={1}>{visual.title}</Text>
        <Text style={{ color: C.gray500, fontSize: 11, marginTop: 1 }} numberOfLines={2}>{detail}</Text>
      </View>
      {state.isOnline && state.status !== 'syncing' && <Text style={{ color: visual.color, fontSize: 11, fontWeight: '700' }}>Sync now</Text>}
    </TouchableOpacity>
  );
}
