import { Tabs } from 'expo-router';
import { Text, Platform, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import { C } from '../../../components/ui';

function TabIcon({ name, focused }: { name: string; focused: boolean }) {
  const icons: Record<string, string> = { index: '⌂', chits: '≡', requests: '◉', payouts: '₹' };
  return (
    <Text style={{ fontSize: 18, color: focused ? C.navy : C.gray400, marginBottom: -2 }}>
      {icons[name] ?? '●'}
    </Text>
  );
}

export default function MemberLayout() {
  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ focused }) => <TabIcon name={route.name} focused={focused} />,
        tabBarActiveTintColor: C.navy,
        tabBarInactiveTintColor: C.gray400,
        tabBarBackground: Platform.OS === 'ios'
          ? () => <BlurView intensity={95} tint="systemChromeMaterial" style={StyleSheet.absoluteFill} />
          : undefined,
        tabBarStyle: {
          backgroundColor: Platform.OS === 'ios' ? 'transparent' : C.white,
          borderTopWidth: Platform.OS === 'ios' ? StyleSheet.hairlineWidth : 1,
          borderTopColor: Platform.OS === 'ios' ? 'rgba(200,200,200,0.45)' : C.gray200,
          height: Platform.OS === 'ios' ? 84 : 64,
          paddingBottom: Platform.OS === 'ios' ? 24 : 8,
          paddingTop: 8,
          elevation: 10,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      })}
    >
      <Tabs.Screen name="index"    options={{ title: 'Home' }} />
      <Tabs.Screen name="chits"    options={{ title: 'My Chits' }} />
      <Tabs.Screen name="requests" options={{ title: 'Requests' }} />
      <Tabs.Screen name="payouts"  options={{ title: 'Payouts' }} />
    </Tabs>
  );
}
