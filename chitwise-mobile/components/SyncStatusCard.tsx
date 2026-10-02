import { useEffect, useRef } from 'react';
import { Alert, Animated, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
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

function syncedClock(value: number | null): string {
  if (!value) return 'Not synced yet';
  return `Synced at ${new Date(value).toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', hour12: true,
  })}`;
}

export function SyncStatusCard({ compact = false }: { compact?: boolean }) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const state = useSyncStore();
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (state.status !== 'syncing') {
      pulse.stopAnimation();
      pulse.setValue(1);
      return;
    }
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 0.45, duration: 650, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1, duration: 650, useNativeDriver: true }),
    ]));
    animation.start();
    return () => animation.stop();
  }, [pulse, state.status]);

  const visual = (() => {
    if (state.status === 'syncing') return { mark: '↻', title: 'Syncing…', color: '#2563EB', background: '#EFF6FF' };
    if (state.status === 'offline') return { mark: 'Ⅱ', title: 'Sync paused', color: '#B45309', background: '#FFFBEB' };
    if (state.status === 'conflict' || state.status === 'error') return { mark: '!', title: 'Sync needs attention', color: '#B91C1C', background: '#FEF2F2' };
    if (state.status === 'auth-required') return { mark: '!', title: 'Login required to sync', color: '#B91C1C', background: '#FEF2F2' };
    if (state.pendingCount > 0 || state.status === 'pending') return { mark: '↑', title: `${state.pendingCount} payment${state.pendingCount === 1 ? '' : 's'} waiting`, color: '#B45309', background: '#FFFBEB' };
    return { mark: '✓', title: syncedClock(state.lastSyncedAt), color: C.green, background: '#F0FDF4' };
  })();

  const detail = state.status === 'offline' && state.pendingCount > 0
    ? `${state.pendingCount} change${state.pendingCount === 1 ? '' : 's'} safely stored on this device`
    : state.conflictCount + state.failedCount > 0
      ? `${state.conflictCount + state.failedCount} operation${state.conflictCount + state.failedCount === 1 ? '' : 's'} require review`
      : state.message ?? relativeTime(state.lastSyncedAt);

  if (compact) {
    const subtitle = state.status === 'syncing'
      ? 'Sending saved changes securely'
      : state.status === 'offline'
        ? (state.pendingCount > 0 ? `${state.pendingCount} saved safely on this device` : 'Changes will resume when connected')
        : state.status === 'auth-required'
          ? `${state.pendingCount > 0 ? `${state.pendingCount} payment${state.pendingCount === 1 ? '' : 's'} waiting — ` : ''}Tap to sign in and sync`
          : state.pendingCount > 0 || state.status === 'pending'
            ? 'Saved safely on this device'
            : state.status === 'synced'
              ? 'Everything is up to date'
              : detail;
    return (
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={`${visual.title}. ${subtitle}. Tap to sync now.`}
        activeOpacity={0.72}
        onPress={handlePress}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4, alignSelf: 'flex-start' }}
      >
        <Animated.View style={{
          opacity: pulse, width: 24, height: 20, borderRadius: 10,
          backgroundColor: visual.background, alignItems: 'center', justifyContent: 'center',
          shadowColor: visual.color, shadowOffset: { width: 2, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 2,
        }}>
          <Text style={{ fontSize: 12, color: visual.color }}>☁</Text>
          <View style={{ position: 'absolute', right: -2, bottom: -1, width: 10, height: 10, borderRadius: 5, backgroundColor: visual.color, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#fff', fontSize: 6, fontWeight: '900' }}>{visual.mark}</Text>
          </View>
        </Animated.View>
        <View>
          <Text style={{ color: visual.color, fontSize: 10, fontWeight: '700' }}>{visual.title}</Text>
          <Text style={{ color: C.gray500, fontSize: 9, marginTop: 0 }}>{subtitle}</Text>
        </View>
      </TouchableOpacity>
    );
  }

  async function handlePress() {
    if (state.status === 'auth-required') {
      router.push('/(auth)/login');
      return;
    }
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
        shadowColor: visual.color, shadowOffset: { width: 4, height: 4 }, shadowOpacity: 0.16, shadowRadius: 8, elevation: 3,
      }}
    >
      <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: `${visual.color}18`, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: visual.color, fontSize: 15, fontWeight: '900' }}>{visual.mark}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color: visual.color, fontSize: 13, fontWeight: '800' }} numberOfLines={1}>{visual.title}</Text>
        <Text style={{ color: C.gray500, fontSize: 11, marginTop: 1 }} numberOfLines={2}>{detail}</Text>
      </View>
      {state.isOnline && state.status !== 'syncing' && <Text style={{ color: visual.color, fontSize: 11, fontWeight: '700' }}>Sync now</Text>}
    </TouchableOpacity>
  );
}
