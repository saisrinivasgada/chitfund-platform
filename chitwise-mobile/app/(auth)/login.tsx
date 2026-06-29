import { useState } from 'react';
import { View, Text, SafeAreaView, KeyboardAvoidingView, Platform, TouchableOpacity, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../../store/authStore';
import { login } from '../../services/api';
import { C, T, Input, Button } from '../../components/ui';

export default function LoginScreen() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const setUser = useAuthStore((s) => s.setUser);
  const router = useRouter();

  async function handleLogin() {
    if (!username.trim() || !password.trim()) {
      setError('Enter username and password');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const data = await login(username.trim(), password);
      setUser({
        id:       data.userId,
        username: data.username,
        fullName: data.fullName,
        role:     data.role as any,
        token:    data.token,
      });
      // AuthGuard will redirect automatically
    } catch (err: any) {
      const msg = err.response?.data?.message ?? err.message ?? 'Login failed';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.navy }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 28 }}>
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
            <Text style={{ fontSize: 14, color: C.white + 'AA', marginTop: 4 }}>Chit Fund Management</Text>
          </View>

          {/* Form Card */}
          <View style={{
            backgroundColor: C.white, borderRadius: 24,
            padding: 24,
            shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.15, shadowRadius: 24, elevation: 10,
          }}>
            <Text style={{ fontSize: 20, fontWeight: '700', color: C.navy, marginBottom: 20 }}>Sign In</Text>

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
              onChangeText={setPassword}
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
          </View>

          <Text style={{ textAlign: 'center', color: C.white + '66', fontSize: 12, marginTop: 32 }}>
            ChitWise © {new Date().getFullYear()}
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
