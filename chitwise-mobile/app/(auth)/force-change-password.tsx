import { useState } from 'react';
import { View, Text, KeyboardAvoidingView, Platform, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { useAuthStore } from '../../store/authStore';
import { changePassword } from '../../services/api';
import { C, T, Input, Button } from '../../components/ui';

export default function ForceChangePasswordScreen() {
  const { user, setUser, logout } = useAuthStore();
  const router = useRouter();

  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd]         = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [error, setError]           = useState('');

  const changeMut = useMutation({
    mutationFn: () => changePassword(currentPwd, newPwd),
    onSuccess: () => {
      if (user) {
        setUser({ ...user, mustChangePassword: false });
      }
      // AuthGuard will pick up mustChangePassword=false and redirect to main app
    },
    onError: (e: any) => {
      const msg = e.response?.data?.message ?? 'Failed to change password';
      setError(msg);
    },
  });

  function handleSubmit() {
    setError('');
    if (!currentPwd || !newPwd || !confirmPwd) {
      setError('All fields are required'); return;
    }
    if (newPwd.length < 8) {
      setError('New password must be at least 8 characters'); return;
    }
    if (newPwd !== confirmPwd) {
      setError('Passwords do not match'); return;
    }
    if (newPwd === currentPwd) {
      setError('New password must be different from your temporary password'); return;
    }
    changeMut.mutate();
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.navy }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 28 }}>

          {/* Icon + title */}
          <View style={{ alignItems: 'center', marginBottom: 36 }}>
            <View style={{
              width: 72, height: 72, borderRadius: 36,
              backgroundColor: C.amber,
              alignItems: 'center', justifyContent: 'center',
              marginBottom: 16,
              shadowColor: C.amber, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 12,
            }}>
              <Text style={{ fontSize: 32 }}>🔑</Text>
            </View>
            <Text style={{ fontSize: 22, fontWeight: '800', color: C.white, letterSpacing: -0.5 }}>Set Your Password</Text>
            <Text style={{ fontSize: 13, color: C.white + 'AA', marginTop: 8, textAlign: 'center', lineHeight: 20 }}>
              Your account uses a temporary password.{'\n'}Please set a new one to continue.
            </Text>
          </View>

          {/* Card */}
          <View style={{
            backgroundColor: C.white, borderRadius: 24, padding: 24,
            shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 24, elevation: 10,
          }}>
            {/* Context banner */}
            <View style={{ backgroundColor: '#FFF7ED', borderRadius: 12, padding: 14, marginBottom: 20, borderLeftWidth: 3, borderLeftColor: C.amber }}>
              <Text style={{ fontSize: 13, color: '#92400E', fontWeight: '600', marginBottom: 2 }}>Temporary password active</Text>
              <Text style={{ fontSize: 12, color: '#B45309', lineHeight: 18 }}>
                Hi {user?.fullName?.split(' ')[0] ?? 'there'}, your admin has set a temporary password for your account. Enter it below along with your new password.
              </Text>
            </View>

            <Input
              label="Temporary Password (current)"
              value={currentPwd}
              onChangeText={(v) => setCurrentPwd(v.replace(/\s/g, ''))}
              placeholder="The password your admin gave you"
              secureTextEntry
            />
            <View style={{ height: 14 }} />
            <Input
              label="New Password"
              value={newPwd}
              onChangeText={(v) => setNewPwd(v.replace(/\s/g, ''))}
              placeholder="Min 8 characters"
              secureTextEntry
            />
            {newPwd.length > 0 && newPwd.length < 8 && (
              <Text style={{ fontSize: 11, color: C.amber, marginTop: 4 }}>Must be at least 8 characters</Text>
            )}
            <View style={{ height: 14 }} />
            <Input
              label="Confirm New Password"
              value={confirmPwd}
              onChangeText={(v) => setConfirmPwd(v.replace(/\s/g, ''))}
              placeholder="Re-enter your new password"
              secureTextEntry
            />
            {newPwd && confirmPwd && newPwd !== confirmPwd && (
              <Text style={{ fontSize: 11, color: C.red, marginTop: 4 }}>Passwords do not match</Text>
            )}

            {error ? (
              <View style={{ backgroundColor: '#FEF2F2', borderRadius: 10, padding: 12, marginTop: 16 }}>
                <Text style={{ color: C.red, fontSize: 13 }}>{error}</Text>
              </View>
            ) : null}

            {/* Password strength hint */}
            {newPwd.length >= 8 && newPwd === confirmPwd && (
              <View style={{ backgroundColor: '#F0FDF4', borderRadius: 10, padding: 12, marginTop: 12 }}>
                <Text style={{ color: C.green, fontSize: 12, fontWeight: '600' }}>✓ Passwords match and meet requirements</Text>
              </View>
            )}

            <View style={{ height: 20 }} />
            <Button
              label="Set New Password"
              variant="primary"
              onPress={handleSubmit}
              loading={changeMut.isPending}
              disabled={!currentPwd || !newPwd || !confirmPwd || newPwd !== confirmPwd || newPwd.length < 8}
              fullWidth
              size="lg"
            />

            <View style={{ height: 12 }} />
            <Button
              label="Sign out"
              variant="ghost"
              onPress={() => Alert.alert('Sign Out', 'Sign out and return to login?', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Sign Out', onPress: logout },
              ])}
              fullWidth
            />
          </View>

          <Text style={{ textAlign: 'center', color: C.white + '44', fontSize: 11, marginTop: 24 }}>
            ChitWise © {new Date().getFullYear()}
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
