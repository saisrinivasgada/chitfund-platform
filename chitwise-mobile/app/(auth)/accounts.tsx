import { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, Platform, ActionSheetIOS } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as LocalAuthentication from 'expo-local-authentication';
import { accountStorageId, useAuthStore, StoredAccount } from '../../store/authStore';
import { logoutAccount } from '../../services/api';
import { getStoredAccountScope } from '../../offline/accountScope';
import { getSyncCounts, purgeAccountOfflineData } from '../../offline/database';
import { isBiometricEnabled } from '../../utils/biometrics';
import { C, formatPhone } from '../../components/ui';
import RoleLogo from '../../components/RoleLogo';

// Kept in sync with app/_layout.tsx's ROLE_GROUP — mirrors it locally so this
// screen can navigate to the right app section right after a switch, without
// depending on the root navigation guard's redirect timing.
const ROLE_GROUP: Record<string, string> = {
  ADMIN: '(admin)', MANAGER: '(manager)', STAFF: '(staff)',
  MEMBER: '(member)', SUPER_ADMIN: '(superadmin)', SUPPORT_AGENT: '(hub)',
};

const ROLE_BADGE_COLOR: Record<string, string> = {
  ADMIN: '#1D4ED8', MANAGER: '#7C3AED', STAFF: '#059669',
  MEMBER: '#D97706', SUPER_ADMIN: '#9F1239',
};

export default function AccountsScreen() {
  const router = useRouter();
  const { user, accounts, switchToAccount, removeAccount, logoutFromAccount } = useAuthStore();
  const [busyId, setBusyId] = useState<string | null>(null);

  function goToRoleHome(role: string) {
    const target = ROLE_GROUP[role];
    router.replace((target ? `/(app)/${target}` : '/(auth)/login') as any);
  }

  async function handleSwitch(acc: StoredAccount) {
    if (!acc.sessionValid) {
      router.push({ pathname: '/(auth)/login', params: { addAccount: '1', username: acc.username } } as any);
      return;
    }
    const biometricEnabled = await isBiometricEnabled();
    if (biometricEnabled) {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: `Switch to ${acc.fullName || acc.username}`,
        cancelLabel: 'Cancel',
        disableDeviceFallback: false,
      });
      if (!result.success) return;
    }
    setBusyId(acc.accountId);
    const result = await switchToAccount(acc.accountId);
    setBusyId(null);
    if (result === 'needs-login') {
      router.push({ pathname: '/(auth)/login', params: { addAccount: '1', username: acc.username } } as any);
    } else if (result) {
      goToRoleHome(acc.role);
    } else {
      Alert.alert('Switch Failed', 'Could not switch account. Please log in again.');
    }
  }

  async function doLogoutAccount(acc: StoredAccount) {
    if (acc.refreshToken) {
      try { await logoutAccount(acc.refreshToken); } catch {}
    }
    await logoutFromAccount(acc.accountId);
  }

  async function doRemoveAccount(acc: StoredAccount) {
    const scope = getStoredAccountScope(acc);
    let pending = 0;
    try {
      const counts = await getSyncCounts(scope);
      pending = counts.pending + counts.conflicts + counts.failed;
    } catch {
      // No encrypted database exists in online-only/Expo Go environments.
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
            try { await purgeAccountOfflineData(scope); } catch {}
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
          const phoneLine = acc.phone ? formatPhone(acc.phoneCountryCode ?? '+91', acc.phone) : null;

          return (
            <View key={acc.accountId} style={{
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
                      onPress={() => handleSwitch(acc)}
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
                  <TouchableOpacity onPress={() => handleAccountOptions(acc)} style={{ padding: 6 }}>
                    <Text style={{ fontSize: 20, color: C.gray400, lineHeight: 20 }}>⋮</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          );
        })}

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
