import { NativeDeviceLock } from './NativeDeviceLock';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, AppState, Modal, Text, TouchableOpacity, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { accountStorageId, useAuthStore } from '../store/authStore';
import { authenticateDevice, deviceAuthenticationInProgress, isBiometricEnabled, subscribeDeviceUnlock } from '../utils/biometrics';
import { authorizeDeviceSession, getDeviceUnlockSession, invalidateDeviceSession, subscribeDeviceSession } from '../utils/deviceUnlockSession';
import { requestSignOut } from '../offline/signOut';
import { C } from './ui';

function activeAccountId() {
  const user = useAuthStore.getState().user;
  return user ? accountStorageId(user.id, user.tenantId, user.authSource) : null;
}

/** Outside the keyed account provider so switching cannot reset its protection. */
export function DeviceUnlockGate({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((state) => state.user);
  const loading = useAuthStore((state) => state.isLoading);
  const session = useSyncExternalStore(subscribeDeviceSession, getDeviceUnlockSession, getDeviceUnlockSession);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [obscured, setObscured] = useState(AppState.currentState !== 'active');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const prompting = useRef(false);
  const attempted = useRef('');
  const accountId = user ? accountStorageId(user.id, user.tenantId, user.authSource) : null;
  const locked = !!accountId && enabled === true && !session.accounts.has(accountId);

  const loadSetting = useCallback(async () => {
    try { setEnabled(await isBiometricEnabled()); setError(''); }
    catch { setEnabled(null); setError('Device unlock settings could not be read. Please try again.'); }
  }, []);

  useEffect(() => {
    loadSetting();
    return subscribeDeviceUnlock((value, approvedAccount) => {
      if (value) {
        const id = activeAccountId() ?? approvedAccount;
        if (id) authorizeDeviceSession(id);
      }
      setEnabled(value);
      setError('');
    });
  }, [loadSetting]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      setObscured(next !== 'active');
      // Android's own credential activity can background the app. Its pending
      // OS proof must complete; iOS interruptions only temporarily hide content.
      if (next === 'background' && !deviceAuthenticationInProgress()) invalidateDeviceSession();
    });
    return () => subscription.remove();
  }, []);

  const unlock = useCallback(async () => {
    if (prompting.current || !accountId || AppState.currentState !== 'active') return;
    prompting.current = true; setBusy(true); setError('');
    const epoch = getDeviceUnlockSession().epoch;
    try {
      const success = await authenticateDevice();
      if (success && activeAccountId() === accountId && getDeviceUnlockSession().epoch === epoch) {
        authorizeDeviceSession(accountId);
      } else setError('ChitWise remains locked. Unlock with your phone’s security method to continue.');
    } finally { prompting.current = false; setBusy(false); }
  }, [accountId]);

  useEffect(() => {
    if (!locked || loading || obscured) return;
    const key = `${accountId}:${session.epoch}`;
    if (attempted.current === key) return;
    attempted.current = key;
    unlock();
  }, [locked, loading, obscured, accountId, session.epoch, unlock]);

  const visible = loading || enabled === null || locked || (enabled === true && !!accountId && obscured);
  return <View style={{ flex: 1 }}>
    {children}
    {NativeDeviceLock ? <NativeDeviceLock
      style={{ position: 'absolute', width: 1, height: 1 }} pointerEvents="none"
      active={visible} protectionEnabled={enabled === true && !!accountId}
      busy={loading || busy || obscured} canSignOut={!!accountId}
      title={loading ? 'ChitWise' : 'ChitWise is locked'}
      message={error || 'Use your phone’s fingerprint, face or device passcode to continue.'}
      buttonTitle={enabled === null ? 'Try again' : 'Unlock ChitWise'}
      onUnlockPress={enabled === null ? loadSetting : unlock}
      onSignOutPress={() => { requestSignOut(); }}
    /> : visible && <Modal visible animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={() => {}}>
      <View style={{ flex: 1, backgroundColor: C.navy, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <View style={{ width: 80, height: 80, borderRadius: 24, backgroundColor: '#FFFFFF18', alignItems: 'center', justifyContent: 'center', marginBottom: 24 }}>
          <Ionicons name="lock-closed-outline" size={36} color="#FFF" />
        </View>
        <Text style={{ fontSize: 26, fontWeight: '700', color: '#FFF' }}>ChitWise is locked</Text>
        <Text style={{ color: '#FFFFFFBB', textAlign: 'center', marginTop: 12, lineHeight: 22 }}>
          {error || 'Use your phone’s fingerprint, face or device passcode to continue.'}
        </Text>
        {loading || busy || obscured ? <ActivityIndicator style={{ marginTop: 28 }} color="#FFF" /> : <>
          <TouchableOpacity testID="unlock-chitwise" accessibilityRole="button" onPress={enabled === null ? loadSetting : unlock}
            style={{ backgroundColor: '#FFF', borderRadius: 16, paddingHorizontal: 32, paddingVertical: 16, marginTop: 28 }}>
            <Text style={{ color: C.navy, fontWeight: '700' }}>{enabled === null ? 'Try again' : 'Unlock ChitWise'}</Text>
          </TouchableOpacity>
          {accountId && <TouchableOpacity accessibilityRole="button" onPress={() => requestSignOut()} style={{ padding: 18, marginTop: 10 }}>
            <Text style={{ color: '#FFFFFFBB' }}>Sign out</Text>
          </TouchableOpacity>}
        </>}
      </View>
    </Modal>}
  </View>;
}
