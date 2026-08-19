import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, Modal, TouchableOpacity, TextInput,
  Alert, KeyboardAvoidingView, Platform, ActionSheetIOS,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import * as LocalAuthentication from 'expo-local-authentication';
import { useAuthStore, StoredAccount } from '../store/authStore';
import { getMe, updateMyProfile, updateMyMemberProfile, changePassword, getMyMemberProfile, sendPhoneChangeOtp, verifyPhoneChangeOtp, logoutAccount, logoutAllDevices } from '../services/api';
import { C, PhoneInput } from './ui';
import { recordProfileChange, getProfileHistory, HistoryEntry } from '../utils/profileHistory';
import { isBiometricAvailable, isBiometricEnabled, enableBiometric, disableBiometric, biometricTypeName } from '../utils/biometrics';

// ── Field helper ──────────────────────────────────────────────────────────────
function Field({ label, value, onChangeText, placeholder, keyboardType, secureTextEntry, autoCapitalize, hint }: {
  label: string; value: string; onChangeText: (t: string) => void;
  placeholder?: string; keyboardType?: any; secureTextEntry?: boolean;
  autoCapitalize?: any; hint?: string;
}) {
  const [focused, setFocused] = React.useState(false);
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={{ fontSize: 13, fontWeight: '600', color: focused ? C.navy : C.gray700, marginBottom: 6 }}>{label}</Text>
      <TextInput
        value={value} onChangeText={onChangeText} placeholder={placeholder}
        keyboardType={keyboardType ?? 'default'} secureTextEntry={secureTextEntry}
        autoCapitalize={autoCapitalize ?? 'sentences'}
        placeholderTextColor={C.gray400}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          borderWidth: 1.5,
          borderColor: focused ? C.navy : C.gray300,
          borderRadius: 10, padding: 12, fontSize: 14, color: C.gray900,
          ...(focused ? { shadowColor: C.navy, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.12, shadowRadius: 4 } : {}),
        }}
      />
      {hint ? <Text style={{ fontSize: 11, color: C.gray400, marginTop: 4 }}>{hint}</Text> : null}
    </View>
  );
}

// ── Password strength ─────────────────────────────────────────────────────────
function passwordStrength(pw: string) {
  if (!pw) return null;
  let score = 0;
  if (pw.length >= 8)  score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (score <= 2) return { label: 'Weak',   color: '#EF4444', pct: 0.33 };
  if (score <= 3) return { label: 'Fair',   color: '#F59E0B', pct: 0.6  };
  return             { label: 'Strong', color: '#16A34A', pct: 1.0  };
}

// ── Main component ────────────────────────────────────────────────────────────
export default function EditProfileModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { user, logout, accounts, switchToAccount, removeAccount, logoutFromAccount, logoutAll } = useAuthStore();
  const router = useRouter();
  const qc = useQueryClient();
  const role = user?.role ?? 'MEMBER';

  const [biometricAvail, setBiometricAvail] = useState(false);
  const [biometricOn, setBiometricOn] = useState(false);
  const [biometricLabel, setBiometricLabel] = useState('Biometric');

  // Fetch current user data on open
  const { data: me } = useQuery({ queryKey: ['edit-profile-me'], queryFn: getMe, enabled: visible });
  const { data: memberMe } = useQuery({ queryKey: ['edit-profile-member-me'], queryFn: getMyMemberProfile, enabled: visible && role === 'MEMBER' });

  const [tab, setTab] = useState<'profile' | 'security' | 'history' | 'accounts'>('profile');
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  // Phone OTP state
  const [otpStep,  setOtpStep]  = useState<'pending' | null>(null);
  const [otpCode,  setOtpCode]  = useState('');
  const [otpPhone, setOtpPhone] = useState('');
  const [otpCC,    setOtpCC]    = useState('+91');
  const [otpError, setOtpError] = useState('');
  const [otpTimer, setOtpTimer] = useState(0);
  const otpTimerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  // Profile fields
  const [fullName,   setFullName]   = useState('');
  const [username,   setUsername]   = useState('');
  const [email,      setEmail]      = useState('');
  const [phone,      setPhone]      = useState('');
  const [phoneCC,    setPhoneCC]    = useState('+91');
  // Member-specific
  const [mFullName,  setMFullName]  = useState('');
  const [mPhone,     setMPhone]     = useState('');
  const [mPhoneCC,   setMPhoneCC]   = useState('+91');
  const [mEmail,     setMEmail]     = useState('');
  const [mAddress,   setMAddress]   = useState('');
  const [mCity,      setMCity]      = useState('');

  // Security fields
  const [curPwd,     setCurPwd]     = useState('');
  const [newPwd,     setNewPwd]     = useState('');
  const [confPwd,    setConfPwd]    = useState('');

  useEffect(() => {
    if (!visible) return;
    Promise.all([isBiometricAvailable(), isBiometricEnabled(), biometricTypeName()]).then(
      ([avail, on, label]) => { setBiometricAvail(avail); setBiometricOn(on); setBiometricLabel(label); }
    );
  }, [visible]);

  async function handleSwitchAccount(acc: StoredAccount) {
    if (!acc.sessionValid) {
      onClose();
      router.push({ pathname: '/(auth)/login', params: { addAccount: '1' } } as any);
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
    const result = await switchToAccount(acc.userId);
    if (result === 'needs-login') {
      onClose();
      router.push({ pathname: '/(auth)/login', params: { addAccount: '1' } } as any);
    } else if (result) {
      onClose();
    } else {
      Alert.alert('Switch Failed', 'Could not switch account. Please log in again.');
    }
  }

  async function handleAccountOptions(acc: StoredAccount) {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Cancel', 'Logout', 'Delete Account'],
          destructiveButtonIndex: 2,
          cancelButtonIndex: 0,
        },
        async (idx) => {
          if (idx === 1) await doLogoutAccount(acc);
          if (idx === 2) await doDeleteAccount(acc);
        }
      );
    } else {
      Alert.alert(acc.fullName || acc.username, `@${acc.username} · ${acc.role}`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Logout', onPress: () => doLogoutAccount(acc) },
        { text: 'Delete Account', style: 'destructive', onPress: () => doDeleteAccount(acc) },
      ]);
    }
  }

  async function doLogoutAccount(acc: StoredAccount) {
    if (acc.refreshToken) {
      try { await logoutAccount(acc.refreshToken); } catch {}
    }
    await logoutFromAccount(acc.userId);
  }

  async function doDeleteAccount(acc: StoredAccount) {
    if (acc.refreshToken) {
      try { await logoutAccount(acc.refreshToken); } catch {}
    }
    await removeAccount(acc.userId);
  }

  async function handleLogoutAll() {
    Alert.alert(
      'Logout from All Devices',
      'This will sign you out on all devices including this one. You will need to login again.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout All', style: 'destructive',
          onPress: async () => {
            try {
              await logoutAllDevices();
            } catch {}
            await logoutAll();
            onClose();
          },
        },
      ]
    );
  }

  // Pre-fill when data loads
  useEffect(() => {
    if (!visible) return;
    setTab('profile');
    if (me) {
      setFullName(me.fullName ?? '');
      setUsername(me.username ?? '');
      setEmail(me.email ?? '');
      setPhone(me.phone ?? '');
      setPhoneCC(me.phoneCountryCode ?? '+91');
    }
    if (memberMe) {
      setMFullName(memberMe.fullName ?? '');
      setMPhone(memberMe.phone ?? '');
      setMPhoneCC(memberMe.phoneCountryCode ?? '+91');
      setMEmail(memberMe.email ?? '');
      setMAddress(memberMe.address ?? '');
      setMCity(memberMe.city ?? '');
    }
    setCurPwd(''); setNewPwd(''); setConfPwd('');
  }, [visible, me, memberMe]);

  // Load history when History tab opens
  useEffect(() => {
    if (tab === 'history' && user?.id) {
      getProfileHistory(user.id).then(setHistory);
    }
  }, [tab, user?.id]);

  function computeChanges() {
    const changes: { field: string; from: string; to: string }[] = [];
    if (fullName   !== (me?.fullName   ?? '')) changes.push({ field: 'Full Name', from: me?.fullName   ?? '', to: fullName });
    if (username   !== (me?.username   ?? '')) changes.push({ field: 'Username',  from: me?.username   ?? '', to: username });
    if (email      !== (me?.email      ?? '')) changes.push({ field: 'Email',     from: me?.email      ?? '', to: email });
    if (phone      !== (me?.phone      ?? '')) changes.push({ field: 'Phone',     from: me?.phone      ?? '', to: `${phoneCC} ${phone}` });
    if (role === 'MEMBER') {
      if (mFullName !== (memberMe?.fullName ?? '')) changes.push({ field: 'Member Name',  from: memberMe?.fullName ?? '', to: mFullName });
      if (mPhone    !== (memberMe?.phone    ?? '')) changes.push({ field: 'Member Phone', from: memberMe?.phone    ?? '', to: `${mPhoneCC} ${mPhone}` });
      if (mEmail    !== (memberMe?.email    ?? '')) changes.push({ field: 'Member Email', from: memberMe?.email    ?? '', to: mEmail });
      if (mAddress  !== (memberMe?.address  ?? '')) changes.push({ field: 'Address',      from: memberMe?.address  ?? '', to: mAddress });
      if (mCity     !== (memberMe?.city     ?? '')) changes.push({ field: 'City',         from: memberMe?.city     ?? '', to: mCity });
    }
    return changes;
  }

  const profileMut = useMutation({
    mutationFn: async () => {
      const ops: Promise<any>[] = [];
      // Phone is excluded — handled separately via OTP flow
      const nonPhoneUserChanged = fullName !== (me?.fullName ?? '') || username !== (me?.username ?? '') || email !== (me?.email ?? '');
      if (nonPhoneUserChanged) {
        ops.push(updateMyProfile({ fullName: fullName || undefined, username: username || undefined, email: email || null }));
      }
      if (role === 'MEMBER') {
        const memberChanged = mFullName !== (memberMe?.fullName ?? '') || mPhone !== (memberMe?.phone ?? '')
          || mPhoneCC !== (memberMe?.phoneCountryCode ?? '+91') || mEmail !== (memberMe?.email ?? '')
          || mAddress !== (memberMe?.address ?? '') || mCity !== (memberMe?.city ?? '');
        if (memberChanged) {
          ops.push(updateMyMemberProfile({ fullName: mFullName || undefined, phone: mPhone || undefined, phoneCountryCode: mPhoneCC, email: mEmail || null, address: mAddress || null, city: mCity || null }));
        }
      }
      const changes = computeChanges();
      await Promise.all(ops);
      return changes;
    },
    onSuccess: (changes) => {
      qc.invalidateQueries({ queryKey: ['edit-profile-me'] });
      qc.invalidateQueries({ queryKey: ['edit-profile-member-me'] });
      qc.invalidateQueries({ queryKey: ['me'] });
      if (user?.id && changes.length > 0) {
        recordProfileChange(user.id, changes);
      }
    },
    onError: (e: any) => Alert.alert('Error', e.response?.data?.message ?? 'Failed to save'),
  });

  const passwordMut = useMutation({
    mutationFn: () => {
      if (!curPwd) throw new Error('Enter your current password');
      if (newPwd.length < 8) throw new Error('New password must be at least 8 characters');
      if (newPwd !== confPwd) throw new Error('Passwords do not match');
      return changePassword(curPwd, newPwd);
    },
    onSuccess: () => {
      Alert.alert('Done', 'Password changed successfully');
      setCurPwd(''); setNewPwd(''); setConfPwd('');
      onClose();
    },
    onError: (e: any) => Alert.alert('Error', e?.message ?? e.response?.data?.message ?? 'Failed'),
  });

  function startOtpTimer() {
    setOtpTimer(60);
    if (otpTimerRef.current) clearInterval(otpTimerRef.current);
    otpTimerRef.current = setInterval(() => {
      setOtpTimer((t) => { if (t <= 1) { if (otpTimerRef.current) clearInterval(otpTimerRef.current); return 0; } return t - 1; });
    }, 1000);
  }

  const sendOtpMut = useMutation({
    mutationFn: ({ phone, countryCode }: { phone: string; countryCode: string }) =>
      sendPhoneChangeOtp({ phone, countryCode }),
    onSuccess: () => {
      setOtpStep('pending');
      setOtpCode('');
      setOtpError('');
      startOtpTimer();
    },
    onError: (e: any) => Alert.alert('Error', e.response?.data?.message ?? 'Failed to send OTP. Please try again.'),
  });

  const verifyOtpMut = useMutation({
    mutationFn: ({ phone, countryCode, code }: { phone: string; countryCode: string; code: string }) =>
      verifyPhoneChangeOtp({ phone, countryCode, code }),
    onSuccess: () => {
      if (otpTimerRef.current) clearInterval(otpTimerRef.current);
      qc.invalidateQueries({ queryKey: ['edit-profile-me'] });
      qc.invalidateQueries({ queryKey: ['me'] });
      setOtpStep(null);
      Alert.alert('Verified', 'Phone number updated successfully');
      onClose();
    },
    onError: (e: any) => {
      const msg = e.response?.data?.message ?? 'Incorrect OTP. Please try again.';
      const isMaxAttempts = e.response?.data?.errorCode === 'OTP_004';
      setOtpError(msg);
      if (isMaxAttempts) {
        setOtpCode('');
        if (otpTimerRef.current) clearInterval(otpTimerRef.current);
        setOtpTimer(0);
      }
    },
  });

  const strength = passwordStrength(newPwd);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: C.white }}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: C.gray200 }}>
          <View>
            <Text style={{ fontSize: 18, fontWeight: '800', color: C.navy }}>Account Settings</Text>
            <Text style={{ fontSize: 12, color: C.gray400, marginTop: 2 }}>Update your profile and security</Text>
          </View>
          <TouchableOpacity onPress={onClose}>
            <Text style={{ fontSize: 28, color: C.gray400 }}>×</Text>
          </TouchableOpacity>
        </View>

        {/* Tab switcher */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ flexDirection: 'row', marginHorizontal: 16, marginTop: 12, marginBottom: 4, backgroundColor: C.gray100 ?? C.gray50, borderRadius: 12, padding: 4 }}
        >
          {([
            { id: 'profile',  label: 'Profile' },
            { id: 'security', label: 'Security' },
            { id: 'accounts', label: `Accounts${accounts.length > 1 ? ` (${accounts.length})` : ''}` },
            ...(role === 'ADMIN' ? [{ id: 'history', label: 'My Changes' }] : []),
          ] as const).map(({ id, label }) => (
            <TouchableOpacity key={id} onPress={() => setTab(id as any)} style={{
              paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10, alignItems: 'center',
              backgroundColor: tab === id ? C.white : 'transparent',
            }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: tab === id ? C.navy : C.gray400, whiteSpace: 'nowrap' } as any}>
                {label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

            {/* ── Profile tab ─────────────────────────────────────────────── */}
            {tab === 'profile' && (
              <>
                <Text style={{ fontSize: 11, fontWeight: '700', color: C.gray400, letterSpacing: 0.8, marginBottom: 12 }}>LOGIN ACCOUNT</Text>
                <Field label="Full Name" value={fullName} onChangeText={setFullName} placeholder="Sai Srinivas" />
                <Field label="Username" value={username} onChangeText={(t) => setUsername(t.toLowerCase().replace(/[^a-z0-9_.]/g, ''))} placeholder="sai_srinivas" autoCapitalize="none" hint="Letters, numbers, _ and . only" />
                <Field label="Email" value={email} onChangeText={setEmail} placeholder="sai@example.com" keyboardType="email-address" autoCapitalize="none" />
                <View style={{ marginBottom: 14 }}>
                  <PhoneInput
                    label="Phone"
                    countryCode={phoneCC}
                    phone={phone}
                    onCountryChange={(cc) => { setPhoneCC(cc); setOtpStep(null); }}
                    onPhoneChange={(t) => { setPhone(t); setOtpStep(null); }}
                  />
                </View>

                {otpStep === 'pending' && (
                  <View style={{ borderWidth: 1.5, borderColor: '#6366F1', borderRadius: 14, padding: 16, backgroundColor: '#F5F3FF', marginBottom: 14 }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: '#4338CA', marginBottom: 4 }}>
                      📱 OTP sent to {otpCC} {otpPhone}
                    </Text>
                    <Text style={{ fontSize: 12, color: C.gray500, marginBottom: 12 }}>
                      Enter the 6-digit code to verify your new number.
                    </Text>
                    <TextInput
                      value={otpCode}
                      onChangeText={(t) => { setOtpCode(t.replace(/\D/g, '')); setOtpError(''); }}
                      keyboardType="numeric"
                      maxLength={6}
                      placeholder="000000"
                      placeholderTextColor={C.gray300}
                      autoFocus
                      style={{
                        borderWidth: 2, borderColor: otpError ? '#EF4444' : '#6366F1',
                        borderRadius: 12, padding: 14,
                        fontSize: 28, fontWeight: '800', color: '#1E3A5F',
                        textAlign: 'center', letterSpacing: 12, backgroundColor: '#fff',
                      }}
                    />
                    {otpError ? (
                      <Text style={{ fontSize: 12, color: '#EF4444', marginTop: 6 }}>{otpError}</Text>
                    ) : null}
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 }}>
                      <TouchableOpacity onPress={() => { setOtpStep(null); setOtpCode(''); setOtpError(''); if (otpTimerRef.current) clearInterval(otpTimerRef.current); }}>
                        <Text style={{ fontSize: 12, color: C.gray400, textDecorationLine: 'underline' }}>Change number</Text>
                      </TouchableOpacity>
                      {otpTimer > 0 ? (
                        <Text style={{ fontSize: 12, color: C.gray400 }}>Resend in {otpTimer}s</Text>
                      ) : (
                        <TouchableOpacity onPress={() => sendOtpMut.mutate({ phone: otpPhone, countryCode: otpCC })} disabled={sendOtpMut.isPending}>
                          <Text style={{ fontSize: 12, fontWeight: '700', color: '#6366F1' }}>
                            {sendOtpMut.isPending ? 'Sending…' : 'Resend OTP'}
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                )}

                {role === 'MEMBER' && (
                  <>
                    <View style={{ height: 1, backgroundColor: C.gray200, marginBottom: 16, marginTop: 4 }} />
                    <Text style={{ fontSize: 11, fontWeight: '700', color: C.gray400, letterSpacing: 0.8, marginBottom: 12 }}>MEMBER PROFILE</Text>
                    <Text style={{ fontSize: 12, color: C.gray400, marginBottom: 14 }}>This is your registered member info shown to your admin.</Text>
                    <Field label="Member Full Name" value={mFullName} onChangeText={setMFullName} placeholder="Your full name" />
                    <View style={{ marginBottom: 14 }}>
                      <PhoneInput label="Member Phone" countryCode={mPhoneCC} phone={mPhone} onCountryChange={setMPhoneCC} onPhoneChange={setMPhone} />
                    </View>
                    <Field label="Contact Email" value={mEmail} onChangeText={setMEmail} placeholder="contact@example.com" keyboardType="email-address" autoCapitalize="none" />
                    <Field label="Address" value={mAddress} onChangeText={setMAddress} placeholder="House / Flat, Street, Area" />
                    <Field label="City" value={mCity} onChangeText={setMCity} placeholder="Hyderabad" />
                  </>
                )}
              </>
            )}

            {/* ── Security tab ────────────────────────────────────────────── */}
            {tab === 'security' && (
              <>
                <View style={{ backgroundColor: C.navy50, borderRadius: 10, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: '#B8CCE4' }}>
                  <Text style={{ fontSize: 13, color: C.navy }}>🛡️  Choose a strong password you don't use anywhere else.</Text>
                </View>
                <Field label="Current Password" value={curPwd} onChangeText={setCurPwd} placeholder="Current password" secureTextEntry autoCapitalize="none" />
                <Field label="New Password" value={newPwd} onChangeText={setNewPwd} placeholder="Min 8 characters" secureTextEntry autoCapitalize="none" />
                {strength && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: -8, marginBottom: 14 }}>
                    <View style={{ flex: 1, height: 4, backgroundColor: C.gray200, borderRadius: 2 }}>
                      <View style={{ width: `${strength.pct * 100}%` as any, height: 4, backgroundColor: strength.color, borderRadius: 2 }} />
                    </View>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: strength.color }}>{strength.label}</Text>
                  </View>
                )}
                <Field label="Confirm New Password" value={confPwd} onChangeText={setConfPwd} placeholder="Repeat new password" secureTextEntry autoCapitalize="none"
                  hint={confPwd && newPwd !== confPwd ? 'Passwords do not match' : confPwd && newPwd === confPwd ? '✓ Passwords match' : undefined} />

                {biometricAvail && (
                  <>
                    <View style={{ height: 1, backgroundColor: C.gray200, marginVertical: 16 }} />
                    <Text style={{ fontSize: 11, fontWeight: '700', color: C.gray400, letterSpacing: 0.8, marginBottom: 12 }}>APP LOCK</Text>
                    <TouchableOpacity
                      onPress={async () => {
                        if (biometricOn) {
                          Alert.alert(`Disable ${biometricLabel}?`, 'You will need your password to open the app.', [
                            { text: 'Cancel', style: 'cancel' },
                            { text: 'Disable', style: 'destructive', onPress: async () => { await disableBiometric(); setBiometricOn(false); } },
                          ]);
                        } else {
                          Alert.alert(`Enable ${biometricLabel}`, `Log out and sign in again — you'll be prompted to enable ${biometricLabel} after login.`, [{ text: 'OK' }]);
                        }
                      }}
                      style={{
                        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                        backgroundColor: biometricOn ? C.navy50 : C.gray50,
                        borderRadius: 12, padding: 14, borderWidth: 1.5,
                        borderColor: biometricOn ? C.navy + '40' : C.gray200,
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <Text style={{ fontSize: 22 }}>🔒</Text>
                        <View>
                          <Text style={{ fontSize: 14, fontWeight: '700', color: C.navy }}>{biometricLabel} Unlock</Text>
                          <Text style={{ fontSize: 11, color: C.gray500, marginTop: 1 }}>
                            {biometricOn ? 'Tap to disable' : `Use ${biometricLabel} to open app`}
                          </Text>
                        </View>
                      </View>
                      <View style={{
                        width: 44, height: 26, borderRadius: 13,
                        backgroundColor: biometricOn ? C.navy : C.gray300,
                        justifyContent: 'center',
                        paddingHorizontal: 2,
                      }}>
                        <View style={{
                          width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff',
                          alignSelf: biometricOn ? 'flex-end' : 'flex-start',
                        }} />
                      </View>
                    </TouchableOpacity>
                  </>
                )}

                <View style={{ height: 1, backgroundColor: C.gray200, marginVertical: 16 }} />
                <Text style={{ fontSize: 11, fontWeight: '700', color: C.gray400, letterSpacing: 0.8, marginBottom: 12 }}>DANGER ZONE</Text>
                <TouchableOpacity
                  onPress={handleLogoutAll}
                  style={{ borderWidth: 1.5, borderColor: '#DC2626', borderRadius: 12, padding: 14, alignItems: 'center' }}
                >
                  <Text style={{ fontSize: 14, fontWeight: '700', color: '#DC2626' }}>Logout from All Devices</Text>
                  <Text style={{ fontSize: 11, color: '#9CA3AF', marginTop: 3 }}>Signs out every device including this one</Text>
                </TouchableOpacity>
              </>
            )}

            {/* ── Accounts tab ────────────────────────────────────────────── */}
            {tab === 'accounts' && (
              <>
                <Text style={{ fontSize: 11, fontWeight: '700', color: C.gray400, letterSpacing: 0.8, marginBottom: 12 }}>
                  SAVED ACCOUNTS
                </Text>

                {accounts.map((acc: StoredAccount) => {
                  const isCurrent = acc.userId === user?.id;
                  const initials = (acc.fullName || acc.username || '?')[0].toUpperCase();
                  const needsLogin = !acc.sessionValid;
                  const roleBadgeColor: Record<string, string> = {
                    ADMIN: '#1D4ED8', MANAGER: '#7C3AED', STAFF: '#059669',
                    MEMBER: '#D97706', SUPER_ADMIN: '#9F1239',
                  };
                  const badgeColor = roleBadgeColor[acc.role] ?? C.navy;

                  const cachedLine = (() => {
                    if (!acc.cachedInfo) return null;
                    const { outstandingBalance, pendingCollectionAmount, activeGroupsCount, totalMembersCount } = acc.cachedInfo;
                    if (acc.role === 'MEMBER' && outstandingBalance != null)
                      return `Outstanding: ₹${outstandingBalance.toLocaleString('en-IN')}`;
                    if ((acc.role === 'STAFF' || acc.role === 'MANAGER') && pendingCollectionAmount != null)
                      return `To collect: ₹${pendingCollectionAmount.toLocaleString('en-IN')}`;
                    if (acc.role === 'ADMIN') {
                      const parts = [];
                      if (activeGroupsCount != null) parts.push(`${activeGroupsCount} groups`);
                      if (totalMembersCount != null) parts.push(`${totalMembersCount} members`);
                      if (parts.length) return parts.join(' · ');
                    }
                    return null;
                  })();

                  return (
                    <View key={acc.userId} style={{
                      backgroundColor: isCurrent ? C.navy50 : needsLogin ? '#FFFBEB' : C.white,
                      borderRadius: 16, padding: 14, marginBottom: 10,
                      borderWidth: 1.5,
                      borderColor: isCurrent ? C.navy + '40' : needsLogin ? '#FCD34D' : C.gray200,
                    }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                        {/* Avatar */}
                        <View style={{
                          width: 46, height: 46, borderRadius: 23,
                          backgroundColor: isCurrent ? C.navy : needsLogin ? '#FCD34D' : C.gray200,
                          alignItems: 'center', justifyContent: 'center',
                        }}>
                          <Text style={{ fontSize: 17, fontWeight: '800', color: isCurrent ? '#fff' : needsLogin ? '#92400E' : C.gray500 }}>
                            {needsLogin ? '!' : initials}
                          </Text>
                        </View>

                        {/* Info */}
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
                                <Text style={{ fontSize: 9, fontWeight: '700', color: '#92400E' }}>LOGIN REQUIRED</Text>
                              </View>
                            )}
                          </View>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
                            <View style={{ backgroundColor: badgeColor + '18', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 }}>
                              <Text style={{ fontSize: 10, fontWeight: '700', color: badgeColor }}>{acc.role}</Text>
                            </View>
                            {acc.tenantName ? (
                              <Text style={{ fontSize: 11, color: C.gray500 }} numberOfLines={1}>{acc.tenantName}</Text>
                            ) : (
                              <Text style={{ fontSize: 11, color: C.gray400 }}>@{acc.username}</Text>
                            )}
                          </View>
                          {cachedLine && !needsLogin && (
                            <Text style={{ fontSize: 11, color: C.gray500, marginTop: 4 }}>{cachedLine}</Text>
                          )}
                        </View>

                        {/* Actions */}
                        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                          {!isCurrent && (
                            <TouchableOpacity
                              onPress={() => handleSwitchAccount(acc)}
                              style={{
                                backgroundColor: needsLogin ? '#F59E0B' : C.navy,
                                borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6,
                              }}
                            >
                              <Text style={{ fontSize: 12, fontWeight: '700', color: '#fff' }}>
                                {needsLogin ? 'Login' : 'Switch'}
                              </Text>
                            </TouchableOpacity>
                          )}
                          <TouchableOpacity
                            onPress={() => handleAccountOptions(acc)}
                            style={{ padding: 6 }}
                          >
                            <Text style={{ fontSize: 20, color: C.gray400, lineHeight: 20 }}>⋮</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  );
                })}

                {/* Add account button */}
                <TouchableOpacity
                  onPress={() => {
                    onClose();
                    router.push({ pathname: '/(auth)/login', params: { addAccount: '1' } } as any);
                  }}
                  style={{
                    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                    borderWidth: 1.5, borderColor: C.navy, borderRadius: 14,
                    padding: 14, marginTop: 4,
                  }}
                >
                  <Text style={{ fontSize: 20, color: C.navy }}>+</Text>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: C.navy }}>Add Another Account</Text>
                </TouchableOpacity>

                <Text style={{ fontSize: 11, color: C.gray400, textAlign: 'center', marginTop: 12 }}>
                  Accounts are stored securely on this device. Removing an account only removes it from this device.
                </Text>
              </>
            )}

            {/* ── History tab ─────────────────────────────────────────────── */}
            {tab === 'history' && (
              <>
                {history.length === 0 ? (
                  <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                    <Text style={{ fontSize: 32, marginBottom: 12 }}>📋</Text>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: C.gray700, marginBottom: 6 }}>No changes yet</Text>
                    <Text style={{ fontSize: 13, color: C.gray400, textAlign: 'center' }}>
                      Profile edits you make will appear here.
                    </Text>
                  </View>
                ) : (
                  history.map((entry, idx) => (
                    <View key={entry.id} style={{ marginBottom: 16, paddingLeft: 14, borderLeftWidth: 2, borderLeftColor: idx === 0 ? C.navy : C.gray200 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8, marginLeft: -18 }}>
                        <View style={{
                          width: 10, height: 10, borderRadius: 5,
                          backgroundColor: idx === 0 ? C.navy : C.gray300,
                          borderWidth: idx === 0 ? 2 : 0, borderColor: C.gray50,
                        }} />
                        <Text style={{ fontSize: 11, color: C.gray400 }}>
                          {new Date(entry.at).toLocaleString('en-IN', {
                            day: '2-digit', month: 'short', year: 'numeric',
                            hour: '2-digit', minute: '2-digit', hour12: true,
                          })}
                        </Text>
                      </View>
                      {entry.changes.map((c, ci) => (
                        <View key={ci} style={{ backgroundColor: '#F8FAFC', borderRadius: 8, padding: 10, marginBottom: 6, borderWidth: 1, borderColor: '#F1F5F9' }}>
                          <Text style={{ fontSize: 12, fontWeight: '700', color: C.gray700, marginBottom: 4 }}>{c.field}</Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                            {c.from ? (
                              <Text style={{ fontSize: 11, backgroundColor: '#FEF2F2', color: '#991B1B', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, textDecorationLine: 'line-through' }}>
                                {c.from || '(empty)'}
                              </Text>
                            ) : null}
                            {c.from ? <Text style={{ fontSize: 11, color: C.gray400 }}>→</Text> : null}
                            <Text style={{ fontSize: 11, backgroundColor: '#F0FDF4', color: '#166534', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                              {c.to || '(empty)'}
                            </Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  ))
                )}
              </>
            )}

          </ScrollView>

          {/* Footer */}
          <View style={{ padding: 16, borderTopWidth: 1, borderTopColor: C.gray200, gap: 10 }}>
            {tab === 'accounts' && null}
            {tab === 'profile' && (
              otpStep === 'pending' ? (
                <TouchableOpacity
                  onPress={() => verifyOtpMut.mutate({ phone: otpPhone, countryCode: otpCC, code: otpCode })}
                  disabled={otpCode.length !== 6 || verifyOtpMut.isPending}
                  style={{ backgroundColor: '#6366F1', borderRadius: 12, padding: 14, alignItems: 'center', opacity: (otpCode.length !== 6 || verifyOtpMut.isPending) ? 0.5 : 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>
                    {verifyOtpMut.isPending ? 'Verifying…' : 'Verify & Save'}
                  </Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  onPress={async () => {
                    const phoneChanged = role !== 'MEMBER' && (phone !== (me?.phone ?? '') || phoneCC !== (me?.phoneCountryCode ?? '+91'));
                    await profileMut.mutateAsync();
                    if (phoneChanged) {
                      setOtpPhone(phone);
                      setOtpCC(phoneCC);
                      sendOtpMut.mutate({ phone, countryCode: phoneCC });
                    } else {
                      Alert.alert('Saved', 'Profile updated successfully');
                      onClose();
                    }
                  }}
                  disabled={profileMut.isPending || sendOtpMut.isPending}
                  style={{ backgroundColor: C.navy, borderRadius: 12, padding: 14, alignItems: 'center', opacity: (profileMut.isPending || sendOtpMut.isPending) ? 0.6 : 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: C.white }}>
                    {profileMut.isPending ? 'Saving…' : sendOtpMut.isPending ? 'Sending OTP…' : 'Save Changes'}
                  </Text>
                </TouchableOpacity>
              )
            )}
            {tab === 'security' && (
              <TouchableOpacity
                onPress={() => passwordMut.mutate()}
                disabled={passwordMut.isPending || !curPwd || !newPwd || !confPwd}
                style={{ backgroundColor: C.navy, borderRadius: 12, padding: 14, alignItems: 'center', opacity: (passwordMut.isPending || !curPwd || !newPwd || !confPwd) ? 0.5 : 1 }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: C.white }}>
                  {passwordMut.isPending ? 'Updating…' : 'Update Password'}
                </Text>
              </TouchableOpacity>
            )}

            {/* Logout — always visible */}
            <TouchableOpacity
              onPress={() => Alert.alert('Log Out', 'Sign out of this account? The account will remain saved on this device.', [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Log Out', style: 'destructive',
                  onPress: async () => {
                    const refreshToken = user ? accounts.find(a => a.userId === user.id)?.refreshToken : undefined;
                    if (refreshToken) { try { await logoutAccount(refreshToken); } catch {} }
                    onClose();
                    await logout();
                  },
                },
              ])}
              style={{ borderWidth: 1.5, borderColor: C.red ?? '#DC2626', borderRadius: 12, padding: 14, alignItems: 'center' }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: C.red ?? '#DC2626' }}>Log Out</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}
