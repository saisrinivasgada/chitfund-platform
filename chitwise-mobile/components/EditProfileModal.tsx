import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, Modal, TouchableOpacity, TextInput,
  Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../store/authStore';
import { getMe, updateMyProfile, updateMyMemberProfile, changePassword, getMyMemberProfile } from '../services/api';
import { C, PhoneInput } from './ui';
import { recordProfileChange, getProfileHistory, HistoryEntry } from '../utils/profileHistory';

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
  const { user, logout } = useAuthStore();
  const qc = useQueryClient();
  const role = user?.role ?? 'MEMBER';

  // Fetch current user data on open
  const { data: me } = useQuery({ queryKey: ['edit-profile-me'], queryFn: getMe, enabled: visible });
  const { data: memberMe } = useQuery({ queryKey: ['edit-profile-member-me'], queryFn: getMyMemberProfile, enabled: visible && role === 'MEMBER' });

  const [tab, setTab] = useState<'profile' | 'security' | 'history'>('profile');
  const [history, setHistory] = useState<HistoryEntry[]>([]);

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
      const userChanged = fullName !== (me?.fullName ?? '') || username !== (me?.username ?? '')
        || email !== (me?.email ?? '') || phone !== (me?.phone ?? '') || phoneCC !== (me?.phoneCountryCode ?? '+91');
      if (userChanged) {
        ops.push(updateMyProfile({ fullName: fullName || undefined, username: username || undefined, email: email || null, phone: phone || undefined, phoneCountryCode: phoneCC }));
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
      Alert.alert('Saved', 'Profile updated successfully');
      onClose();
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

        {/* Tab switcher — History only for ADMIN (profile history is admin-only) */}
        <View style={{ flexDirection: 'row', marginHorizontal: 16, marginTop: 12, marginBottom: 4, backgroundColor: C.gray100 ?? C.gray50, borderRadius: 12, padding: 4 }}>
          {([
            { id: 'profile',  label: 'Profile' },
            { id: 'security', label: 'Security' },
            ...(role === 'ADMIN' ? [{ id: 'history', label: 'My Changes' }] : []),
          ] as const).map(({ id, label }) => (
            <TouchableOpacity key={id} onPress={() => setTab(id as any)} style={{
              flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center',
              backgroundColor: tab === id ? C.white : 'transparent',
            }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: tab === id ? C.navy : C.gray400 }}>
                {label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

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
                  <PhoneInput label="Phone" countryCode={phoneCC} phone={phone} onCountryChange={setPhoneCC} onPhoneChange={setPhone} />
                </View>

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
            {tab === 'profile' && (
              <TouchableOpacity
                onPress={() => profileMut.mutate()}
                disabled={profileMut.isPending}
                style={{ backgroundColor: C.navy, borderRadius: 12, padding: 14, alignItems: 'center', opacity: profileMut.isPending ? 0.6 : 1 }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: C.white }}>
                  {profileMut.isPending ? 'Saving…' : 'Save Changes'}
                </Text>
              </TouchableOpacity>
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
              onPress={() => Alert.alert('Log Out', 'Are you sure you want to log out?', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Log Out', style: 'destructive', onPress: () => { onClose(); logout(); } },
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
