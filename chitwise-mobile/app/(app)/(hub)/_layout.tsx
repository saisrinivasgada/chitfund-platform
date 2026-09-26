import { Tabs } from 'expo-router';
import { Text, Platform } from 'react-native';
import { C } from '../../../components/ui';

export default function HubEmployeeLayout() {
  return <Tabs screenOptions={({ route }) => ({
    headerShown: false,
    tabBarIcon: ({ focused }) => <Text style={{ fontSize: 18, color: focused ? C.navy : C.gray400 }}>{route.name === 'tickets' ? '🎫' : route.name === 'chat' ? '💬' : '⌂'}</Text>,
    tabBarActiveTintColor: C.navy,
    tabBarInactiveTintColor: C.gray400,
    tabBarStyle: { backgroundColor: C.gray50, borderTopWidth: 0, height: Platform.OS === 'ios' ? 84 : 64, paddingBottom: Platform.OS === 'ios' ? 24 : 8, paddingTop: 8, shadowColor: '#AEB9C7', shadowOffset: { width: 0, height: -5 }, shadowOpacity: 0.42, shadowRadius: 10, elevation: 12 },
  })}>
    <Tabs.Screen name="index" options={{ title: 'Hub' }} />
    <Tabs.Screen name="tickets" options={{ title: 'Tickets' }} />
    <Tabs.Screen name="chat" options={{ title: 'Team Chat' }} />
  </Tabs>;
}
