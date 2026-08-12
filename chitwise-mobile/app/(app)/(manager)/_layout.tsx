import { Tabs } from 'expo-router';
import { Text, Platform, Modal, Pressable, TouchableOpacity, View } from 'react-native';
import { C } from '../../../components/ui';
import { useUIStore } from '../../../store/uiStore';

function TabIcon({ name, focused }: { name: string; focused: boolean }) {
  const icons: Record<string, string> = { index: '⌂', payments: '₹', chits: '≡', members: '◉', reports: '≡' };
  return (
    <Text style={{ fontSize: 18, color: focused ? C.navy : C.gray400, marginBottom: -2 }}>
      {icons[name] ?? '●'}
    </Text>
  );
}

export default function ManagerLayout() {
  const { planExpiredVisible, hidePlanExpired } = useUIStore();

  return (
    <>
      <Modal transparent animationType="fade" visible={planExpiredVisible} onRequestClose={hidePlanExpired}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', padding: 24 }} onPress={hidePlanExpired}>
          <Pressable style={{ backgroundColor: '#fff', borderRadius: 20, padding: 24, width: '100%', maxWidth: 340 }} onPress={() => {}}>
            <Text style={{ fontSize: 28, textAlign: 'center', marginBottom: 4 }}>🚫</Text>
            <Text style={{ fontSize: 17, fontWeight: '700', color: '#111827', textAlign: 'center', marginBottom: 8 }}>Subscription Expired</Text>
            <Text style={{ fontSize: 14, color: '#6B7280', textAlign: 'center', lineHeight: 21, marginBottom: 20 }}>
              Your organization's plan has expired. Please contact your admin to renew.
            </Text>
            <TouchableOpacity onPress={hidePlanExpired} style={{ backgroundColor: '#DC2626', borderRadius: 12, paddingVertical: 13, marginBottom: 10 }}>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15, textAlign: 'center' }}>Dismiss</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ focused }) => <TabIcon name={route.name} focused={focused} />,
        tabBarActiveTintColor: C.navy,
        tabBarInactiveTintColor: C.gray400,
        tabBarStyle: {
          backgroundColor: C.white, borderTopColor: C.gray200,
          height: Platform.OS === 'ios' ? 84 : 64,
          paddingBottom: Platform.OS === 'ios' ? 24 : 8, paddingTop: 8,
          elevation: 10,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      })}
    >
      <Tabs.Screen name="index"    options={{ title: 'Dashboard' }} />
      <Tabs.Screen name="payments" options={{ title: 'Payments' }} />
      <Tabs.Screen name="chits"    options={{ title: 'Chits' }} />
      <Tabs.Screen name="members"  options={{ title: 'Members' }} />
    </Tabs>
    </>
  );
}
