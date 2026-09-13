import { View, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../../../store/authStore';
import { C } from '../../../components/ui';

export default function HubHome() {
  const router = useRouter();
  const { user, logout } = useAuthStore();
  return <SafeAreaView style={{ flex: 1, backgroundColor: C.gray50 }}>
    <View style={{ padding: 20 }}>
      <Text style={{ fontSize: 24, fontWeight: '800', color: C.navy }}>ChitWise Hub</Text>
      <Text style={{ fontSize: 14, color: C.gray500, marginTop: 5 }}>Welcome, {user?.fullName}</Text>
      <View style={{ marginTop: 24, gap: 12 }}>
        <TouchableOpacity onPress={() => router.push('/(app)/(hub)/tickets' as any)} style={{ backgroundColor: C.white, borderRadius: 16, padding: 18, borderWidth: 1, borderColor: C.gray200 }}><Text style={{ fontSize: 17, fontWeight: '700', color: C.navy }}>🎫 Tickets</Text><Text style={{ fontSize: 12, color: C.gray500, marginTop: 4 }}>Handle organization requests and public inquiries</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => router.push('/(app)/(hub)/chat' as any)} style={{ backgroundColor: C.white, borderRadius: 16, padding: 18, borderWidth: 1, borderColor: C.gray200 }}><Text style={{ fontSize: 17, fontWeight: '700', color: C.navy }}>💬 Team Chat</Text><Text style={{ fontSize: 12, color: C.gray500, marginTop: 4 }}>Coordinate with ChitWise employees</Text></TouchableOpacity>
      </View>
      <TouchableOpacity onPress={logout} style={{ alignSelf: 'center', padding: 14, marginTop: 20 }}><Text style={{ color: C.red, fontWeight: '600' }}>Sign out</Text></TouchableOpacity>
    </View>
  </SafeAreaView>;
}
