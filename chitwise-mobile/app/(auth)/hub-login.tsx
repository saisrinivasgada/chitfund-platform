import { useState } from 'react';
import { View, Text, Image, KeyboardAvoidingView, Platform, TouchableOpacity, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../../store/authStore';
import { hubLogin } from '../../services/api';
import { C, Input, Button } from '../../components/ui';

export default function HubLoginScreen() {
  const setUser = useAuthStore(s => s.setUser);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function signIn() {
    if (!username.trim() || !password) return;
    setLoading(true); setError('');
    try {
      const data = await hubLogin(username.trim(), password);
      await setUser({
        id: data.id,
        username: data.username,
        fullName: data.fullName,
        role: data.role,
        token: data.saasToken ?? '',
        refreshToken: data.refreshToken,
        hubToken: data.token,
        authSource: 'HUB',
        mustChangePassword: data.mustChangePassword,
        canManageIdentityCases: data.canManageIdentityCases,
        platformOwner: data.platformOwner,
      });
    } catch (e: any) {
      setError(e.response?.data?.message ?? 'Invalid Hub credentials');
    } finally { setLoading(false); }
  }

  const helpEmail = `mailto:help@thechitwise.com?subject=${encodeURIComponent('ChitWise Hub password reset request')}`;

  return <SafeAreaView style={{ flex: 1, backgroundColor: C.navy }}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 28 }}>
      <View style={{ alignItems: 'center', marginBottom: 32 }}>
        <Image source={require('../../assets/hub-icon.png')} style={{ width: 78, height: 78, borderRadius: 18 }} />
        <Text style={{ color: C.white, fontSize: 25, fontWeight: '800', marginTop: 15 }}>ChitWise Hub</Text>
        <Text style={{ color: C.white + 'AA', fontSize: 13, textAlign: 'center', marginTop: 7, lineHeight: 19 }}>
          For ChitWise employees and management only
        </Text>
      </View>

      <View style={{ backgroundColor: C.white, borderRadius: 24, padding: 24 }}>
        <Text style={{ color: C.navy, fontSize: 20, fontWeight: '700', marginBottom: 20 }}>Employee sign in</Text>
        <Input label="Username" value={username} onChangeText={setUsername} autoCapitalize="none" placeholder="Your Hub username" />
        <View style={{ height: 14 }} />
        <Input label="Password" value={password} onChangeText={v => setPassword(v.replace(/\s/g, ''))} secureTextEntry placeholder="Your Hub password" onSubmitEditing={signIn} />
        {error ? <View style={{ backgroundColor: '#FEF2F2', borderRadius: 10, padding: 12, marginTop: 12 }}><Text style={{ color: C.red, fontSize: 13 }}>{error}</Text></View> : null}
        <View style={{ height: 20 }} />
        <Button label="Sign in to Hub" onPress={signIn} loading={loading} disabled={!username.trim() || !password} fullWidth size="lg" />
        <TouchableOpacity onPress={() => Linking.openURL(helpEmail)} style={{ alignItems: 'center', paddingTop: 16 }}>
          <Text style={{ color: C.navy, fontSize: 13, fontWeight: '600' }}>Forgot password? Email ChitWise Help</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
