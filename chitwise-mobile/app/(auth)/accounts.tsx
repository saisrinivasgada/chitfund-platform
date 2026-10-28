import { authorizeDeviceSession } from '../../utils/deviceUnlockSession';
import { effectiveOfflineAccess } from '../../offline/accessPolicy';
import { offlinePresentation } from '../../../shared/offline/presentation';
import { restoreOfflineAccess, useOfflineAccessStore } from '../../offline/access';
import { ROLE_ROUTE_GROUP as ROLE_GROUP } from '../../utils/roleRoutes';
import { useQueryClient } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';
import NetInfo from '@react-native-community/netinfo';
import { accountSyncSummary } from '../../../shared/offline/accountSyncSummary';
import { synchronizeAccount } from '../../offline/syncEngine';
import { prepareOfflineData, restorePreparationState, usePreparationStore } from '../../offline/preparation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, Platform, ActionSheetIOS } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { accountStorageId, useAuthStore, StoredAccount } from '../../store/authStore';
import { logoutAccount } from '../../services/api';
import { requestSignOut } from '../../offline/signOut';
import { getAccountScope, getStoredAccountScope } from '../../offline/accountScope';
import { getSyncCounts, getLastSyncedAt, makeRetryableOperationsReady, hasOfflineDatabase, purgeAccountOfflineData } from '../../offline/database';
import { isBiometricEnabled, authenticateDevice, rememberUnlockAccount } from '../../utils/biometrics';
import { C, formatPhone } from '../../components/ui';
import RoleLogo from '../../components/RoleLogo';
import { useReviewNavigationStore } from '../../store/reviewNavigationStore';

const ROLE_BADGE_COLOR: Record<string, string> = {
  ADMIN: '#1D4ED8', MANAGER: '#7C3AED', STAFF: '#059669',
  MEMBER: '#D97706', SUPER_ADMIN: '#9F1239',
};

export default function AccountsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, accounts, switchToAccount, removeAccount } = useAuthStore();
  const switching = useRef(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [syncInfo, setSyncInfo] = useState<Record<string, any>>({});
  const [online, setOnline] = useState(true);
  const access = useOfflineAccessStore((state) => state.accounts);
  const preparation = usePreparationStore((state) => state.byScope);
  const refreshStatuses = useCallback(async () => {
    const network = await NetInfo.fetch(); setOnline(network.isConnected === true && network.isInternetReachable !== false);
    const results = await Promise.all(accounts.filter((a) => a.authSource !== 'HUB').map(async (account) => {
      const scope = getStoredAccountScope(account);
      let counts = { pending: 0, paused: 0, conflicts: 0, failed: 0, syncing: 0 }; let lastSyncedAt = null;
      try {
        for (const savedScope of [...new Set([scope, ...(account.retainedOfflineScopes ?? [])])]) {
          if (!await hasOfflineDatabase(savedScope)) continue;
          const saved = await getSyncCounts(savedScope);
          for (const key of Object.keys(counts) as (keyof typeof counts)[]) counts[key] += saved[key] ?? 0;
          lastSyncedAt = Math.max(lastSyncedAt ?? 0, await getLastSyncedAt(savedScope) ?? 0) || null;
        }
        await restoreOfflineAccess(scope);
        if (await hasOfflineDatabase(scope) || useOfflineAccessStore.getState().accounts[scope]?.enabled) await restorePreparationState(scope);
        return [account.accountId, { counts, lastSyncedAt }];
      } catch { return [account.accountId, { counts, locked: true }]; }
    }));
    setSyncInfo(Object.fromEntries(results));
  }, [accounts]);
  useEffect(() => { let active = true; const update = () => { if (active) refreshStatuses().catch(() => {}); };
    update(); const timer = setInterval(update, 3_000); return () => { active = false; clearInterval(timer); };
  }, [refreshStatuses]);
  async function syncAccount(account: StoredAccount) {
    if (!account.sessionValid) { await handleSwitch(account); return; }
    const scope = getStoredAccountScope(account); setSyncingId(account.accountId);
    try { await makeRetryableOperationsReady(scope); await synchronizeAccount(scope, getAccountScope(useAuthStore.getState().user) === scope ? queryClient : undefined); await prepareOfflineData(scope, { force: true, deadline: Date.now() + 20_000 }); }
    catch { Alert.alert('Sync paused', 'The connection was interrupted. Saved collections remain protected and will retry for this account.'); }
    finally { setSyncingId(null); await refreshStatuses(); }
  }

  function goToRoleHome(role: string) {
    const target = ROLE_GROUP[role];
    router.replace((target ? `/(app)/${target}` : '/(auth)/login') as any);
  }

  async function handleSwitch(acc: StoredAccount) {
    if (switching.current) return;
    if (!acc.sessionValid) {
      router.push({ pathname: '/(auth)/login', params: { addAccount: '1', username: acc.username } } as any);
      return;
    }
    if (switching.current) return;
    switching.current = true;
    setBusyId(acc.accountId);
    const originalUser = useAuthStore.getState().user;
    const originalId = originalUser ? accountStorageId(originalUser.id, originalUser.tenantId, originalUser.authSource) : null;
    try {
      if (await isBiometricEnabled() && !await authenticateDevice(`Switch to ${acc.fullName || acc.username}`)) return;
      const currentUser = useAuthStore.getState().user;
      const currentId = currentUser ? accountStorageId(currentUser.id, currentUser.tenantId, currentUser.authSource) : null;
      if (currentId !== originalId) return;
      authorizeDeviceSession(acc.accountId);
      const result = await switchToAccount(acc.accountId);
      if (result === 'needs-login') {
        router.push({ pathname: '/(auth)/login', params: { addAccount: '1', username: acc.username } } as any);
      } else if (result) {
        await rememberUnlockAccount(acc.accountId).catch(() => {});
        goToRoleHome(acc.role);
      } else Alert.alert('Switch failed', 'Could not switch account. Please sign in again.');
    } catch {
      Alert.alert('Could not unlock account', 'Your saved payments are unchanged. Please try again.');
    } finally { switching.current = false; setBusyId(null); }
  }

  async function doLogoutAccount(acc: StoredAccount) {
    await requestSignOut({ accountId: acc.accountId });
  }

  async function doRemoveAccount(acc: StoredAccount) {
    const scope = getStoredAccountScope(acc);
    const scopes = [...new Set([scope, ...(acc.retainedOfflineScopes ?? [])])];
    let pending = 0;
    for (const savedScope of scopes) {
      if (!await hasOfflineDatabase(savedScope)) continue;
      try {
        const counts = await getSyncCounts(savedScope);
        pending += counts.pending + counts.conflicts + counts.failed;
      } catch {
        Alert.alert('Saved records are locked', 'Unlock this device before removing the account so its saved collections can be checked.');
        return;
      }
    }
    Alert.alert(
      'Remove account from this device?',
      pending > 0
        ? `${pending} saved payment ${pending === 1 ? 'change has' : 'changes have'} not finished syncing. Removing this account will permanently discard ${pending === 1 ? 'it' : 'them'} from this device.`
        : 'This removes the saved login and encrypted offline data from this device. It does not delete the ChitWise account.',
      [
        { text: 'Keep Account', style: 'cancel' },
        {
          text: pending > 0 ? 'Discard & Remove' : 'Remove',
          style: 'destructive',
          onPress: async () => {
            if (acc.refreshToken) {
              try { await logoutAccount(acc.refreshToken); } catch {}
            }
            for (const savedScope of scopes) { try { await purgeAccountOfflineData(savedScope); } catch {} }
            await removeAccount(acc.accountId);
          },
        },
      ],
    );
  }

  function handleAccountOptions(acc: StoredAccount) {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['Cancel', 'Logout', 'Remove from Device'], destructiveButtonIndex: 2, cancelButtonIndex: 0 },
        async (idx) => {
          if (idx === 1) await doLogoutAccount(acc);
          if (idx === 2) await doRemoveAccount(acc);
        },
      );
    } else {
      Alert.alert(acc.fullName || acc.username, `@${acc.username} · ${acc.role}`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Logout', onPress: () => doLogoutAccount(acc) },
        { text: 'Remove from Device', style: 'destructive', onPress: () => doRemoveAccount(acc) },
      ]);
    }
  }

  const currentAccountId = user
    ? accountStorageId(user.id, user.tenantId, user.authSource ?? 'ORGANIZATION')
    : null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.gray50 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.gray100 }}>
        {user && (
          <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 12, width: 36, height: 36, borderRadius: 10, borderWidth: 1, borderColor: C.gray200, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 18, color: C.gray600 }}>‹</Text>
          </TouchableOpacity>
        )}
        <View>
          <Text style={{ fontSize: 18, fontWeight: '800', color: C.navy }}>{user ? 'Switch Account' : 'Choose an Account'}</Text>
          {!user && <Text style={{ fontSize: 12, color: C.gray500, marginTop: 2 }}>Sign back in to continue</Text>}
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {accounts.map((acc: StoredAccount) => {
          const isCurrent = acc.accountId === currentAccountId;
          const needsLogin = !acc.sessionValid;
          const badgeColor = ROLE_BADGE_COLOR[acc.role] ?? C.navy;
          const status = accountSyncSummary({ ...syncInfo[acc.accountId], sessionValid: acc.sessionValid, online, syncing: syncingId === acc.accountId, preparation: preparation[getStoredAccountScope(acc)] });
          const phoneLine = acc.phone ? formatPhone(acc.phoneCountryCode ?? '+91', acc.phone) : null;

          return (
            <View key={acc.accountId} testID={`saved-account-${acc.username}`} style={{
              backgroundColor: isCurrent ? C.navy50 : needsLogin ? '#FFFBEB' : C.white,
              borderRadius: 16, padding: 14, marginBottom: 10,
              borderWidth: 1.5,
              borderColor: isCurrent ? C.navy + '40' : needsLogin ? '#FCD34D' : C.gray200,
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ position: 'relative' }}>
                  <RoleLogo role={acc.role} size={48} style={needsLogin ? { opacity: 0.6 } : undefined} />
                  {needsLogin && (
                    <View style={{
                      position: 'absolute', top: -4, right: -4, width: 18, height: 18,
                      borderRadius: 9, backgroundColor: '#F59E0B', borderWidth: 2,
                      borderColor: C.white, alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Text style={{ fontSize: 10, fontWeight: '900', color: C.white }}>!</Text>
                    </View>
                  )}
                </View>

                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: isCurrent ? C.navy : C.gray900 }}>
                      {acc.fullName || acc.username}
                    </Text>
                    {isCurrent && (
                      <View style={{ backgroundColor: C.navy, borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 }}>
                        <Text style={{ fontSize: 9, fontWeight: '700', color: '#fff' }}>ACTIVE</Text>
                      </View>
                    )}
                    {needsLogin && (
                      <View style={{ backgroundColor: '#FEF3C7', borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: '#FCD34D' }}>
                        <Text style={{ fontSize: 9, fontWeight: '700', color: '#92400E' }}>NEEDS LOGIN</Text>
                      </View>
                    )}
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3, flexWrap: 'wrap' }}>
                    <View style={{ backgroundColor: badgeColor + '18', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 }}>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: badgeColor }}>{acc.role}</Text>
                    </View>
                    <Text style={{ fontSize: 11, color: C.gray400 }}>@{acc.username}</Text>
                  </View>
                  {phoneLine && (
                    <Text style={{ fontSize: 11, color: C.gray500, marginTop: 3 }}>{phoneLine}</Text>
                  )}
                </View>

                <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                  {!isCurrent && (
                    <TouchableOpacity
                      testID={`switch-account-${acc.username}`} accessibilityRole="button" accessibilityLabel={`Switch to ${acc.tenantName ?? acc.fullName}`} onPress={() => handleSwitch(acc)}
                      disabled={busyId === acc.accountId}
                      style={{
                        backgroundColor: needsLogin ? '#F59E0B' : C.navy,
                        borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6,
                        opacity: busyId === acc.accountId ? 0.6 : 1,
                      }}
                    >
                      <Text style={{ fontSize: 12, fontWeight: '700', color: '#fff' }}>
                        {busyId === acc.accountId ? '…' : needsLogin ? 'Login' : 'Switch'}
                      </Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity testID={`account-options-${acc.username}`} accessibilityLabel={`Options for ${acc.fullName || acc.username}`} onPress={() => handleAccountOptions(acc)} style={{ padding: 6 }}>
                    <Text style={{ fontSize: 20, color: C.gray400, lineHeight: 20 }}>⋮</Text>
                  </TouchableOpacity>
                </View>
              </View>
              {!!acc.tenantName && <Text style={{ color: C.gray500, fontSize: 11, marginTop: 9 }}>{acc.tenantName}</Text>}
              {acc.authSource !== 'HUB' && offlinePresentation(effectiveOfflineAccess(access[getStoredAccountScope(acc)], acc.offlineEnabled, acc.offlineSubscriptionCheckedAt ?? acc.savedAt), acc.offlineEnabled).showSync && <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: C.gray200, paddingTop: 11, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name={status.state === 'ready' ? 'cloud-done-outline' : status.state === 'syncing' ? 'cloud-upload-outline' : !online ? 'cloud-offline-outline' : 'cloud-outline'} size={20} color={status.state === 'ready' ? '#16805D' : status.state === 'syncing' ? '#2563EB' : '#A16207'} />
                <View style={{ flex: 1 }}><Text style={{ color: C.navy, fontSize: 12, fontWeight: '600' }}>{status.label}</Text>
                  {!!status.detail && <Text style={{ color: C.gray500, fontSize: 10, lineHeight: 15, marginTop: 3 }}>{status.detail}</Text>}
                  {!!syncInfo[acc.accountId]?.lastSyncedAt && <Text style={{ color: C.gray400, fontSize: 10, marginTop: 3 }}>Last collection sync · {new Date(syncInfo[acc.accountId].lastSyncedAt).toLocaleString('en-IN')}</Text>}
                </View>
                <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Sync ${acc.tenantName ?? acc.fullName}`} testID={`sync-account-${acc.username}`}
                  disabled={!online || !!syncingId || status.state === 'checking' || !!syncInfo[acc.accountId]?.locked}
                  onPress={() => syncAccount(acc)} style={{ padding: 9, borderRadius: 9, backgroundColor: C.navy50, opacity: !online || syncingId ? 0.5 : 1 }}>
                  <Text style={{ color: C.navy, fontWeight: '700', fontSize: 11 }}>{syncingId === acc.accountId ? 'Syncing…' : !acc.sessionValid ? 'Sign in' : 'Sync now'}</Text>
                </TouchableOpacity>
              </View>}
            </View>
          );
        })}

        {user?.role === 'ADMIN' && user.authSource !== 'HUB' && accounts.some((saved) => {
          const counts = syncInfo[saved.accountId]?.counts;
          return saved.tenantId === user.tenantId && counts && counts.pending + counts.conflicts + counts.failed > 0;
        }) && <TouchableOpacity accessibilityRole="button" disabled={!online || !!busyId} onPress={() => {
          const scope = getAccountScope(useAuthStore.getState().user);
          if (!scope) return;
          router.replace('/(app)/(admin)/payments?tab=Record%20Payment');
          useReviewNavigationStore.getState().openReview(scope);
        }} style={{ padding: 16, borderRadius: 14, backgroundColor: C.navy50, marginBottom: 12, opacity: online ? 1 : 0.5 }}>
          <Text style={{ color: C.navy, fontWeight: '700' }}>Recover earlier collections</Text>
          <Text style={{ color: C.gray600, fontSize: 12, lineHeight: 18, marginTop: 5 }}>Review saved work for this organisation after account access or the subscription changes.</Text>
        </TouchableOpacity>}

        {/* Add another account / fresh login — always available, Instagram-style */}
        <TouchableOpacity
          onPress={() => router.push({ pathname: '/(auth)/login', params: { addAccount: '1' } } as any)}
          activeOpacity={0.75}
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 12,
            borderWidth: 1.5, borderColor: C.gray300, borderStyle: 'dashed',
            borderRadius: 16, padding: 14, marginTop: 4,
          }}
        >
          <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: C.gray100, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 22, color: C.gray500, fontWeight: '700' }}>+</Text>
          </View>
          <View>
            <Text style={{ fontSize: 14, fontWeight: '700', color: C.gray900 }}>Add Account</Text>
            <Text style={{ fontSize: 11, color: C.gray500, marginTop: 1 }}>Log in with a different username</Text>
          </View>
        </TouchableOpacity>

        {accounts.length === 0 && (
          <Text style={{ fontSize: 13, color: C.gray400, textAlign: 'center', marginTop: 24 }}>
            No saved accounts on this device yet.
          </Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
