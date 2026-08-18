import { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, Image, KeyboardAvoidingView, Platform, TouchableOpacity, Modal, Linking, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuthStore } from '../../store/authStore';
import { login, selectTenant, verifyLoginOtp, TenantOption, forgotPasswordLookup, forgotPasswordSendOtp, forgotPasswordVerifyOtp, forgotPasswordResetWithToken } from '../../services/api';
import { C, T, Input, Button } from '../../components/ui';
import {
  isBiometricAvailable,
  isBiometricEnabled,
  enableBiometric,
  disableBiometric,
  promptBiometric,
  biometricTypeName,
} from '../../utils/biometrics';

const OTP_LOCKOUT_SECS = 300;

function validatePassword(pw: string): string | null {
  if (!pw || pw.length < 8) return 'Password must be at least 8 characters';
  if (!/[A-Z]/.test(pw)) return 'Must contain at least one uppercase letter';
  if (!/[a-z]/.test(pw)) return 'Must contain at least one lowercase letter';
  if (!/[0-9]/.test(pw)) return 'Must contain at least one number';
  if (!/[^A-Za-z0-9]/.test(pw)) return 'Must contain at least one special character';
  return null;
}

function ForgotPasswordFlow({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<'lookup' | 'last4' | 'otp' | 'password' | 'done' | 'locked'>('lookup');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [usernameOrPhone, setUsernameOrPhone] = useState('');
  const [last4, setLast4] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const userIdRef = useRef('');
  const maskedPhoneRef = useRef('');
  const roleRef = useRef('');
  const resetTokenRef = useRef('');

  const [lockoutSecs, setLockoutSecs] = useState(0);
  const lockoutRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [resendSecs, setResendSecs] = useState(0);
  const [sendCount, setSendCount] = useState(0);
  const [resendBlocked, setResendBlocked] = useState(false);
  const resendRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (lockoutRef.current) clearInterval(lockoutRef.current);
      if (resendRef.current) clearInterval(resendRef.current);
    };
  }, []);

  function startLockout() {
    if (lockoutRef.current) clearInterval(lockoutRef.current);
    setLockoutSecs(OTP_LOCKOUT_SECS);
    lockoutRef.current = setInterval(() => {
      setLockoutSecs((s) => {
        if (s <= 1) { clearInterval(lockoutRef.current!); lockoutRef.current = null; return 0; }
        return s - 1;
      });
    }, 1000);
  }

  function startResend(seconds: number) {
    if (resendRef.current) clearInterval(resendRef.current);
    setResendSecs(seconds);
    resendRef.current = setInterval(() => {
      setResendSecs((s) => {
        if (s <= 1) { clearInterval(resendRef.current!); resendRef.current = null; return 0; }
        return s - 1;
      });
    }, 1000);
  }

  function fmt(s: number) {
    return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
  }

  async function handleLookup() {
    if (!usernameOrPhone.trim()) return;
    setLoading(true); setError('');
    try {
      const data = await forgotPasswordLookup(usernameOrPhone.trim());
      userIdRef.current = data.userId;
      maskedPhoneRef.current = data.maskedPhone;
      roleRef.current = data.role;
      if (data.locked) { setStep('locked'); return; }
      setStep('last4');
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'User not found');
    } finally { setLoading(false); }
  }

  async function handleLast4() {
    if (last4.length !== 4) return;
    setLoading(true); setError('');
    try {
      await forgotPasswordSendOtp({ userId: userIdRef.current, last4 });
      const nextCount = sendCount + 1;
      setSendCount(nextCount);
      startResend(nextCount * 60);
      setStep('otp');
    } catch (err: any) {
      const code = err.response?.data?.errorCode;
      if (code === 'OTP_005') { setResendBlocked(true); setStep('otp'); }
      else setError(err.response?.data?.message ?? 'Invalid digits. Check the last 4 digits of your registered phone.');
    } finally { setLoading(false); }
  }

  async function handleVerifyOtp() {
    if (otp.length !== 6 || lockoutSecs > 0) return;
    setLoading(true); setError('');
    try {
      const data = await forgotPasswordVerifyOtp({ userId: userIdRef.current, code: otp });
      resetTokenRef.current = data.resetToken;
      if (resendRef.current) clearInterval(resendRef.current);
      setStep('password');
    } catch (err: any) {
      const code = err.response?.data?.code;
      if (code === 'OTP_004') {
        setError('OTP expired or already used. Go back and request a new one.');
      } else {
        startLockout();
        setError('Incorrect OTP. You must wait 5 minutes before trying again.');
      }
    } finally { setLoading(false); }
  }

  async function handleResetPassword() {
    if (!newPassword || newPassword !== confirmPassword) { setError('Passwords do not match'); return; }
    const pwError = validatePassword(newPassword);
    if (pwError) { setError(pwError); return; }
    setLoading(true); setError('');
    try {
      await forgotPasswordResetWithToken({ resetToken: resetTokenRef.current, newPassword });
      setStep('done');
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Reset failed. The link may have expired.');
    } finally { setLoading(false); }
  }

  const errorBox = error ? (
    <View style={{ backgroundColor: '#FEF2F2', borderRadius: 10, padding: 12, marginTop: 12 }}>
      <Text style={{ color: C.red, fontSize: 13 }}>{error}</Text>
    </View>
  ) : null;

  return (
    <View style={{ flex: 1, backgroundColor: C.white }}>
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' }}>
            {step !== 'done' && (
              <TouchableOpacity onPress={onClose} style={{ paddingRight: 16, paddingVertical: 4 }}>
                <Text style={{ fontSize: 22, color: C.navy }}>✕</Text>
              </TouchableOpacity>
            )}
            <Text style={{ fontSize: 18, fontWeight: '700', color: C.navy }}>Reset Password</Text>
          </View>

          <View style={{ padding: 24 }}>
            {/* LOCKED */}
            {step === 'locked' && (
              <View style={{ alignItems: 'center', paddingTop: 24 }}>
                <Text style={{ fontSize: 48, marginBottom: 16 }}>🔒</Text>
                <Text style={{ fontSize: 18, fontWeight: '700', color: C.navy, marginBottom: 8 }}>Account Locked</Text>
                <Text style={{ fontSize: 14, color: '#6B7280', textAlign: 'center', lineHeight: 22 }}>
                  {['ADMIN', 'SUPER_ADMIN'].includes(roleRef.current)
                    ? 'Your account is locked. Please contact ChitWise support to unlock it.'
                    : 'Your account is locked. Please contact your administrator to unlock it.'}
                </Text>
                <TouchableOpacity onPress={onClose} style={{ marginTop: 28 }}>
                  <Text style={{ fontSize: 15, color: C.navy, fontWeight: '600' }}>Back to Login</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* DONE */}
            {step === 'done' && (
              <View style={{ alignItems: 'center', paddingTop: 24 }}>
                <Text style={{ fontSize: 48, marginBottom: 16 }}>✅</Text>
                <Text style={{ fontSize: 18, fontWeight: '700', color: C.navy, marginBottom: 8 }}>Password Reset!</Text>
                <Text style={{ fontSize: 14, color: '#6B7280', textAlign: 'center', lineHeight: 22 }}>
                  Your password has been updated. You can now sign in with your new password.
                </Text>
                <View style={{ height: 28 }} />
                <Button label="Back to Login" onPress={onClose} fullWidth size="lg" />
              </View>
            )}

            {/* STEP 1: Lookup */}
            {step === 'lookup' && (
              <>
                <Text style={{ fontSize: 15, color: '#6B7280', marginBottom: 24, lineHeight: 22 }}>
                  Enter your username or registered phone number.
                </Text>
                <Input
                  label="Username or Phone Number"
                  value={usernameOrPhone}
                  onChangeText={setUsernameOrPhone}
                  placeholder="e.g. john123 or 9876543210"
                  autoCapitalize="none"
                />
                {errorBox}
                <View style={{ height: 20 }} />
                <Button label="Continue" onPress={handleLookup} loading={loading} disabled={!usernameOrPhone.trim()} fullWidth size="lg" />
              </>
            )}

            {/* STEP 2: Last 4 digits */}
            {step === 'last4' && (
              <>
                <Text style={{ fontSize: 15, color: '#6B7280', marginBottom: 8, lineHeight: 22 }}>
                  Enter the last 4 digits of your registered phone number to verify your identity.
                </Text>
                <Text style={{ fontSize: 13, color: '#9CA3AF', marginBottom: 20 }}>
                  Registered phone: {maskedPhoneRef.current}
                </Text>
                <Input
                  label="Last 4 Digits"
                  value={last4}
                  onChangeText={(v) => setLast4(v.replace(/\D/g, '').slice(0, 4))}
                  placeholder="1234"
                  keyboardType="numeric"
                />
                {errorBox}
                <View style={{ height: 20 }} />
                <Button label="Send OTP" onPress={handleLast4} loading={loading} disabled={last4.length !== 4} fullWidth size="lg" />
                <TouchableOpacity onPress={() => { setStep('lookup'); setError(''); setLast4(''); }} style={{ marginTop: 14, alignItems: 'center' }}>
                  <Text style={{ fontSize: 13, color: '#9CA3AF' }}>← Back</Text>
                </TouchableOpacity>
              </>
            )}

            {/* STEP 3: OTP */}
            {step === 'otp' && (
              <>
                <Text style={{ fontSize: 15, color: '#6B7280', marginBottom: 8, lineHeight: 22 }}>
                  Enter the 6-digit OTP sent to {maskedPhoneRef.current}.
                </Text>
                <Input
                  label="OTP"
                  value={otp}
                  onChangeText={(v) => setOtp(v.replace(/\D/g, '').slice(0, 6))}
                  placeholder="123456"
                  keyboardType="numeric"
                />
                {lockoutSecs > 0 && (
                  <View style={{ backgroundColor: '#FFFBEB', borderRadius: 10, padding: 12, marginTop: 12 }}>
                    <Text style={{ color: '#92400E', fontSize: 13 }}>
                      Too many wrong attempts. Try again in {fmt(lockoutSecs)}.
                    </Text>
                  </View>
                )}
                {errorBox}
                <View style={{ height: 20 }} />
                <Button
                  label="Verify OTP"
                  onPress={handleVerifyOtp}
                  loading={loading}
                  disabled={otp.length !== 6 || lockoutSecs > 0}
                  fullWidth
                  size="lg"
                />
                {resendBlocked ? (
                  <Text style={{ textAlign: 'center', fontSize: 13, color: '#DC2626', marginTop: 14 }}>
                    Max OTP attempts — contact help@thechitwise.com
                  </Text>
                ) : resendSecs > 0 ? (
                  <Text style={{ textAlign: 'center', fontSize: 13, color: '#9CA3AF', marginTop: 14 }}>
                    Resend OTP in {fmt(resendSecs)}
                  </Text>
                ) : (
                  <TouchableOpacity onPress={() => { setStep('last4'); setOtp(''); setError(''); if (lockoutRef.current) clearInterval(lockoutRef.current); setLockoutSecs(0); }} style={{ marginTop: 14, alignItems: 'center' }}>
                    <Text style={{ fontSize: 13, color: C.navy, fontWeight: '600' }}>Resend OTP</Text>
                  </TouchableOpacity>
                )}
              </>
            )}

            {/* STEP 4: New Password */}
            {step === 'password' && (
              <>
                <Text style={{ fontSize: 15, color: '#6B7280', marginBottom: 24, lineHeight: 22 }}>
                  Set a new password for your account. Must be at least 8 characters.
                </Text>
                <Input
                  label="New Password"
                  value={newPassword}
                  onChangeText={setNewPassword}
                  placeholder="Enter new password"
                  secureTextEntry
                />
                <View style={{ height: 14 }} />
                <Input
                  label="Confirm Password"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder="Confirm new password"
                  secureTextEntry
                />
                {errorBox}
                <View style={{ height: 20 }} />
                <Button
                  label="Reset Password"
                  onPress={handleResetPassword}
                  loading={loading}
                  disabled={!newPassword || !confirmPassword}
                  fullWidth
                  size="lg"
                />
              </>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

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
  const [showForgot, setShowForgot] = useState(false);
  const [loginOtpState, setLoginOtpState] = useState<{ otpToken: string; maskedPhone: string } | null>(null);
  const [loginOtp, setLoginOtp] = useState('');
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
      if (data.requiresOtp && data.otpToken) {
        setLoginOtpState({ otpToken: data.otpToken, maskedPhone: data.maskedPhone ?? '****' });
        setLoginOtp('');
        return;
      }
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

  async function handleLoginOtpSubmit() {
    if (!loginOtpState || loginOtp.length !== 6) return;
    setError('');
    setLoading(true);
    try {
      const data = await verifyLoginOtp(loginOtpState.otpToken, loginOtp);
      setLoginOtpState(null);
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
      setError(err.response?.data?.message ?? 'Incorrect OTP. Please try again.');
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
            <Image
              source={require('../../assets/logo-dark.png')}
              style={{ width: 200, height: 90, resizeMode: 'contain' }}
            />
            <Text style={{ fontSize: 14, color: C.white + 'AA', marginTop: 8 }}>
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

            <TouchableOpacity
              onPress={() => setShowForgot(true)}
              style={{ marginTop: 14, alignItems: 'center', paddingVertical: 4 }}
            >
              <Text style={{ fontSize: 13, color: C.navy, fontWeight: '600' }}>Forgot password?</Text>
            </TouchableOpacity>

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

      {/* Login OTP verification */}
      <Modal visible={!!loginOtpState} transparent animationType="slide">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: C.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: C.navy, marginBottom: 6 }}>Verify your identity</Text>
            <Text style={{ fontSize: 13, color: '#6B7280', marginBottom: 20 }}>
              A 6-digit OTP was sent to {loginOtpState?.maskedPhone}
            </Text>
            <Input
              label="6-digit OTP"
              value={loginOtp}
              onChangeText={(v) => { setLoginOtp(v.replace(/\D/g, '').slice(0, 6)); setError(''); }}
              placeholder="123456"
              keyboardType="numeric"
            />
            {error ? (
              <View style={{ backgroundColor: '#FEF2F2', borderRadius: 10, padding: 12, marginTop: 12 }}>
                <Text style={{ color: C.red, fontSize: 13 }}>{error}</Text>
              </View>
            ) : null}
            <View style={{ height: 20 }} />
            <Button label="Verify &amp; Sign In" onPress={handleLoginOtpSubmit} loading={loading} disabled={loginOtp.length !== 6} fullWidth size="lg" />
            <TouchableOpacity onPress={() => { setLoginOtpState(null); setLoginOtp(''); setError(''); }} style={{ marginTop: 14, alignItems: 'center' }}>
              <Text style={{ fontSize: 13, color: '#9CA3AF' }}>Cancel — go back</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Forgot password flow */}
      <Modal visible={showForgot} animationType="slide">
        <ForgotPasswordFlow onClose={() => setShowForgot(false)} />
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
