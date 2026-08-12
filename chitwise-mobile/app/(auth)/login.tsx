import { useState, useEffect, useCallback } from 'react';
import { View, Text, KeyboardAvoidingView, Platform, TouchableOpacity, Modal, Linking, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuthStore } from '../../store/authStore';
import { login, selectTenant, TenantOption } from '../../services/api';
import { C, T, Input, Button } from '../../components/ui';
import {
  isBiometricAvailable,
  isBiometricEnabled,
  enableBiometric,
  disableBiometric,
  promptBiometric,
  biometricTypeName,
} from '../../utils/biometrics';

export default function LoginScreen() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [biometricAvail, setBiometricAvail] = useState(false);
  const [biometricOn, setBiometricOn]       = useState(false);
  const [biometricLabel, setBiometricLabel] = useState('Biometric');
  const [showEnablePrompt, setShowEnablePrompt] = useState(false);
  const [pendingCreds, setPendingCreds] = useState<{ username: string; password: string } | null>(null);
  const [tenantPicker, setTenantPicker] = useState<{ loginToken: string; tenants: TenantOption[] } | null>(null);
  const { setUser } = useAuthStore();
  const router  = useRouter();

  // "Add account" mode — navigated here from Accounts tab in profile
  const { addAccount } = useLocalSearchParams<{ addAccount?: string }>();
  const isAddAccountMode = addAccount === '1';

  const checkBiometric = useCallback(async () => {
    const [avail, enabled, label] = await Promise.all([
      isBiometricAvailable(),
      isBiometricEnabled(),
      biometricTypeName(),
    ]);
    setBiometricAvail(avail);
    setBiometricOn(enabled);
    setBiometricLabel(label);
  }, []);

  useEffect(() => {
    checkBiometric();
  }, [checkBiometric]);

  // Auto-trigger biometric on mount (skip in add-account mode)
  useEffect(() => {
    if (biometricOn && !isAddAccountMode) {
      handleBiometricLogin();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [biometricOn]);

  function applyAuth(data: any, offerBiometric = false) {
    setUser({
      id:                data.userId,
      username:          data.username,
      fullName:          data.fullName,
      role:              data.role as any,
      token:             data.token,
      mustChangePassword: data.mustChangePassword,
    });
    if (offerBiometric && biometricAvail && !biometricOn && !data.mustChangePassword) {
      setPendingCreds({ username: username.trim(), password });
      setShowEnablePrompt(true);
    }
  }

  async function handleTenantSelect(loginToken: string, tenantId: string, tenantStatus?: string) {
    if (tenantStatus === 'PENDING') {
      setError('Your organisation is pending activation. Please contact ChitWise support.');
      setTenantPicker(null);
      return;
    }
    setLoading(true);
    try {
      const data = await selectTenant(loginToken, tenantId);
      setTenantPicker(null);
      applyAuth(data, true);
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Tenant selection failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleBiometricLogin() {
    setError('');
    const creds = await promptBiometric();
    if (!creds) return;
    setLoading(true);
    try {
      const data = await login(creds.username, creds.password);
      if (data.requiresTenantSelection && data.loginToken) {
        if (data.tenants?.length === 1) {
          await handleTenantSelect(data.loginToken, data.tenants[0].tenantId, data.tenants[0].status);
        } else {
          setTenantPicker({ loginToken: data.loginToken, tenants: data.tenants ?? [] });
        }
        return;
      }
      applyAuth(data);
    } catch {
      setError('Biometric login failed. Please use your password.');
    } finally {
      setLoading(false);
    }
  }

  async function handleLogin() {
    if (!username.trim() || !password.trim()) {
      setError('Enter username and password');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const data = await login(username.trim(), password);
      if (data.requiresTenantSelection && data.loginToken) {
        if (data.tenants?.length === 1) {
          await handleTenantSelect(data.loginToken, data.tenants[0].tenantId, data.tenants[0].status);
        } else {
          setTenantPicker({ loginToken: data.loginToken, tenants: data.tenants ?? [] });
        }
        return;
      }
      applyAuth(data, true);
    } catch (err: any) {
      setError(err.response?.data?.message ?? err.message ?? 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleEnableBiometric() {
    if (!pendingCreds) return;
    await enableBiometric(pendingCreds.username, pendingCreds.password);
    setBiometricOn(true);
    setShowEnablePrompt(false);
    setPendingCreds(null);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.navy }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 28 }}>
          {/* Back button in add-account mode */}
          {isAddAccountMode && (
            <TouchableOpacity
              onPress={() => router.back()}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 16, paddingVertical: 4 }}
            >
              <Text style={{ fontSize: 20, color: C.white + 'CC' }}>‹</Text>
              <Text style={{ fontSize: 14, color: C.white + 'CC', fontWeight: '600' }}>Cancel</Text>
            </TouchableOpacity>
          )}

          {/* Logo */}
          <View style={{ alignItems: 'center', marginBottom: 48 }}>
            <View style={{
              width: 72, height: 72, borderRadius: 20,
              backgroundColor: C.gold,
              alignItems: 'center', justifyContent: 'center',
              marginBottom: 16,
              shadowColor: C.gold, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 12,
            }}>
              <Text style={{ fontSize: 32, fontWeight: '900', color: C.white }}>C</Text>
            </View>
            <Text style={{ fontSize: 28, fontWeight: '800', color: C.white, letterSpacing: -0.5 }}>ChitWise</Text>
            <Text style={{ fontSize: 14, color: C.white + 'AA', marginTop: 4 }}>
              {isAddAccountMode ? 'Add Another Account' : 'Chit Fund Management'}
            </Text>
          </View>

          {/* Form Card */}
          <View style={{
            backgroundColor: C.white, borderRadius: 24, padding: 24,
            shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.15, shadowRadius: 24, elevation: 10,
          }}>
            <Text style={{ fontSize: 20, fontWeight: '700', color: C.navy, marginBottom: 20 }}>
              {isAddAccountMode ? 'Add Account' : 'Sign In'}
            </Text>

            <Input
              label="Username"
              value={username}
              onChangeText={setUsername}
              placeholder="Enter your username"
              autoCapitalize="none"
            />
            <View style={{ height: 14 }} />
            <Input
              label="Password"
              value={password}
              onChangeText={(v) => setPassword(v.replace(/\s/g, ''))}
              placeholder="Enter your password"
              secureTextEntry
            />

            {error ? (
              <View style={{ backgroundColor: '#FEF2F2', borderRadius: 10, padding: 12, marginTop: 12 }}>
                <Text style={{ color: C.red, fontSize: 13 }}>{error}</Text>
              </View>
            ) : null}

            <View style={{ height: 20 }} />
            <Button
              label="Sign In"
              onPress={handleLogin}
              loading={loading}
              disabled={!username || !password}
              fullWidth
              size="lg"
            />

            {/* Biometric quick-login */}
            {biometricAvail && biometricOn && (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginVertical: 16 }}>
                  <View style={{ flex: 1, height: 1, backgroundColor: '#E5E7EB' }} />
                  <Text style={{ marginHorizontal: 12, fontSize: 12, color: '#9CA3AF' }}>or</Text>
                  <View style={{ flex: 1, height: 1, backgroundColor: '#E5E7EB' }} />
                </View>
                <TouchableOpacity
                  onPress={handleBiometricLogin}
                  disabled={loading}
                  style={{
                    alignItems: 'center', paddingVertical: 13,
                    borderRadius: 12, borderWidth: 1.5,
                    borderColor: C.navy + '30',
                  }}
                >
                  <Text style={{ fontSize: 15, fontWeight: '600', color: C.navy }}>
                    🔒 Sign in with {biometricLabel}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={async () => { await disableBiometric(); setBiometricOn(false); }}
                  style={{ marginTop: 10, alignItems: 'center', paddingVertical: 4 }}
                >
                  <Text style={{ fontSize: 12, color: '#9CA3AF' }}>Disable {biometricLabel} login</Text>
                </TouchableOpacity>
              </>
            )}
          </View>

          <TouchableOpacity
            onPress={() => Linking.openURL('http://3.21.196.51/register')}
            style={{ marginTop: 28, alignItems: 'center', paddingVertical: 4 }}
            activeOpacity={0.7}
          >
            <Text style={{ fontSize: 13, color: C.white + '88', textAlign: 'center' }}>
              New organization?{' '}
              <Text style={{ color: C.gold, fontWeight: '700' }}>Register here →</Text>
            </Text>
          </TouchableOpacity>

          <Text style={{ textAlign: 'center', color: C.white + '44', fontSize: 11, marginTop: 20 }}>
            ChitWise © {new Date().getFullYear()}
          </Text>
        </View>
      </KeyboardAvoidingView>

      {/* Tenant picker — shown when user belongs to multiple orgs */}
      <Modal visible={!!tenantPicker} transparent animationType="slide">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: C.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: C.navy, marginBottom: 6 }}>Select Organisation</Text>
            <Text style={{ fontSize: 13, color: '#6B7280', marginBottom: 20 }}>Choose the org you want to sign into</Text>
            <ScrollView style={{ maxHeight: 320 }}>{tenantPicker?.tenants.map((t) => (
              <TouchableOpacity key={t.tenantId} onPress={() => handleTenantSelect(tenantPicker!.loginToken, t.tenantId, t.status)}
                disabled={loading}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                  padding: 16, borderRadius: 14, borderWidth: 1.5, borderColor: '#E5E7EB',
                  marginBottom: 10, backgroundColor: '#F9FAFB' }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: t.status === 'PENDING' ? '#9CA3AF' : C.navy }}>{t.name}</Text>
                  <Text style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>{t.role} · {t.plan}</Text>
                  {t.status === 'PENDING' && (
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#D97706', marginTop: 3 }}>⏳ Pending Activation</Text>
                  )}
                </View>
                <Text style={{ fontSize: 20, color: t.status === 'PENDING' ? '#9CA3AF' : C.navy }}>›</Text>
              </TouchableOpacity>
            ))}</ScrollView>
            <TouchableOpacity onPress={() => setTenantPicker(null)} style={{ marginTop: 6, alignItems: 'center', paddingVertical: 10 }}>
              <Text style={{ fontSize: 14, color: '#9CA3AF' }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Enable biometric prompt */}
      <Modal visible={showEnablePrompt} transparent animationType="fade">
        <View style={{
          flex: 1, backgroundColor: 'rgba(0,0,0,0.55)',
          justifyContent: 'center', alignItems: 'center', padding: 24,
        }}>
          <View style={{
            backgroundColor: C.white, borderRadius: 24, padding: 28,
            width: '100%', maxWidth: 360,
            shadowColor: '#000', shadowOffset: { width: 0, height: 12 },
            shadowOpacity: 0.2, shadowRadius: 24, elevation: 15,
          }}>
            <Text style={{ fontSize: 36, textAlign: 'center', marginBottom: 12 }}>🔒</Text>
            <Text style={{ fontSize: 18, fontWeight: '700', color: C.navy, textAlign: 'center', marginBottom: 8 }}>
              Enable {biometricLabel}?
            </Text>
            <Text style={{ fontSize: 14, color: '#6B7280', textAlign: 'center', marginBottom: 28, lineHeight: 20 }}>
              Sign in faster next time using {biometricLabel} — no password needed.
            </Text>
            <Button
              label={`Enable ${biometricLabel}`}
              onPress={handleEnableBiometric}
              fullWidth
              size="lg"
            />
            <TouchableOpacity
              onPress={() => { setShowEnablePrompt(false); setPendingCreds(null); }}
              style={{ marginTop: 14, alignItems: 'center', paddingVertical: 8 }}
            >
              <Text style={{ fontSize: 14, color: '#9CA3AF' }}>Not now</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
