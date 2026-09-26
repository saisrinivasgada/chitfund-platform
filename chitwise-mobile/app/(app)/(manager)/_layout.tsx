import { Tabs } from 'expo-router';
import { Text, Modal, Pressable, TouchableOpacity } from 'react-native';
import { C } from '../../../components/ui';
import { NeumorphicTabBackground, NeumorphicTabIcon, neumorphicTabBarStyle, neumorphicTabItemStyle, neumorphicTabLabelStyle } from '../../../components/NeumorphicTabs';
import { useUIStore } from '../../../store/uiStore';
import { useManagerStartupPrefetch } from '../../../offline/useStartupPrefetch';

function TabIcon({ name, focused }: { name: string; focused: boolean }) {
  const icons: Record<string, string> = { index: '⌂', pickups: '✋', payments: '₹', chits: '≡', members: '◉', reports: '≡' };
  return <NeumorphicTabIcon glyph={icons[name] ?? '●'} focused={focused} />;
}

export default function ManagerLayout() {
  const { planExpiredVisible, hidePlanExpired } = useUIStore();
  useManagerStartupPrefetch();

  return (
    <>
      <Modal transparent animationType="fade" visible={planExpiredVisible} onRequestClose={hidePlanExpired}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', padding: 24 }} onPress={hidePlanExpired}>
          <Pressable style={{ backgroundColor: C.surface, borderRadius: 20, padding: 24, width: '100%', maxWidth: 340 }} onPress={() => {}}>
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
        tabBarBackground: NeumorphicTabBackground,
        tabBarStyle: neumorphicTabBarStyle,
        tabBarItemStyle: neumorphicTabItemStyle,
        tabBarLabelStyle: neumorphicTabLabelStyle,
      })}
    >
      <Tabs.Screen name="index"    options={{ title: 'Dashboard' }} />
      <Tabs.Screen name="pickups"  options={{ title: 'My Pickups' }} />
      <Tabs.Screen name="payments" options={{ title: 'Payments' }} />
      <Tabs.Screen name="chits"    options={{ title: 'Chits' }} />
      <Tabs.Screen name="members"  options={{ title: 'Members' }} />
    </Tabs>
    </>
  );
}
