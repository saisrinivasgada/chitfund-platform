import { View, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../../../store/authStore';
import { C } from '../../../components/ui';
import RoleLogo from '../../../components/RoleLogo';

export default function HubHome() {
  const router = useRouter();
  const { user, logout } = useAuthStore();
  return <SafeAreaView style={{ flex: 1, backgroundColor: C.gray50 }}>
    <View style={{ padding: 20 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <RoleLogo role="HUB" size={62} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 24, fontWeight: '800', color: C.navy }}>ChitWise Hub</Text>
          <Text style={{ fontSize: 11, fontWeight: '700', color: C.gold, marginTop: 2 }}>MANAGEMENT & SUPPORT</Text>
        </View>
      </View>
      <View style={{ marginTop: 24, marginBottom: 18 }}>
        <Text style={{ fontSize: 27, lineHeight: 33, fontWeight: '800', color: C.navy, letterSpacing: -0.65 }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.68}>
          Welcome, {user?.fullName?.split(' ')[0] ?? 'Team'} 👋
        </Text>
        <Text style={{ marginTop: 3, fontSize: 12, lineHeight: 17, color: C.gray500 }}>Choose where you want to work.</Text>
      </View>
      <View style={{ gap: 12 }}>
        <TouchableOpacity onPress={() => router.push('/(app)/(hub)/tickets' as any)} style={{ backgroundColor: C.surface, borderRadius: 18, padding: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,0.82)', shadowColor: '#AEB9C7', shadowOffset: { width: 6, height: 6 }, shadowOpacity: 0.46, shadowRadius: 11, elevation: 5 }}><Text style={{ fontSize: 17, fontWeight: '700', color: C.navy }}>🎫 Tickets</Text><Text style={{ fontSize: 12, color: C.gray500, marginTop: 4 }}>Handle organization requests and public inquiries</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => router.push('/(app)/(hub)/chat' as any)} style={{ backgroundColor: C.surface, borderRadius: 18, padding: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,0.82)', shadowColor: '#AEB9C7', shadowOffset: { width: 6, height: 6 }, shadowOpacity: 0.46, shadowRadius: 11, elevation: 5 }}><Text style={{ fontSize: 17, fontWeight: '700', color: C.navy }}>💬 Team Chat</Text><Text style={{ fontSize: 12, color: C.gray500, marginTop: 4 }}>Coordinate with ChitWise employees</Text></TouchableOpacity>
      </View>
      <TouchableOpacity onPress={logout} style={{ alignSelf: 'center', padding: 14, marginTop: 20 }}><Text style={{ color: C.red, fontWeight: '600' }}>Sign out</Text></TouchableOpacity>
    </View>
  </SafeAreaView>;
}
