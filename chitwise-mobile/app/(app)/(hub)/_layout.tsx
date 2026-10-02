import { Tabs } from 'expo-router';
import { C } from '../../../components/ui';
import { NeumorphicTabBackground, NeumorphicTabIcon, neumorphicTabBarStyle, neumorphicTabItemStyle, neumorphicTabLabelStyle } from '../../../components/NeumorphicTabs';

export default function HubEmployeeLayout() {
  return <Tabs screenOptions={({ route }) => ({
    headerShown: false,
    tabBarIcon: ({ focused }) => <NeumorphicTabIcon focused={focused} glyph={route.name === 'tickets' ? '🎫' : route.name === 'chat' ? '💬' : '⌂'} />,
    tabBarActiveTintColor: C.navy,
    tabBarInactiveTintColor: C.gray400,
    tabBarBackground: NeumorphicTabBackground,
    tabBarStyle: neumorphicTabBarStyle,
    tabBarItemStyle: neumorphicTabItemStyle,
    tabBarLabelStyle: neumorphicTabLabelStyle,
  })}>
    <Tabs.Screen name="index" options={{ title: 'Hub' }} />
    <Tabs.Screen name="tickets" options={{ title: 'Tickets' }} />
    <Tabs.Screen name="chat" options={{ title: 'Team Chat' }} />
  </Tabs>;
}
