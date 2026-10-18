import { Tabs } from 'expo-router';
import { C } from '../../../components/ui';
import { NeumorphicTabBackground, NeumorphicTabIcon, useNeumorphicTabBarStyle, neumorphicTabItemStyle, neumorphicTabLabelStyle, selectedTabBackgroundColor, RoundedTabButton } from '../../../components/NeumorphicTabs';

export default function HubEmployeeLayout() {
  const tabBarStyle = useNeumorphicTabBarStyle();
  return <Tabs screenOptions={({ route }) => ({
    headerShown: false,
    tabBarIcon: ({ focused }) => <NeumorphicTabIcon focused={focused} glyph={route.name === 'tickets' ? '🎫' : route.name === 'chat' ? '💬' : '⌂'} />,
    tabBarActiveTintColor: C.white,
        tabBarActiveBackgroundColor: selectedTabBackgroundColor,
        tabBarButton: RoundedTabButton,
    tabBarInactiveTintColor: C.gray400,
    tabBarBackground: NeumorphicTabBackground,
    tabBarStyle,
    tabBarItemStyle: neumorphicTabItemStyle,
    tabBarLabelStyle: neumorphicTabLabelStyle,
  })}>
    <Tabs.Screen name="index" options={{ title: 'Hub' }} />
    <Tabs.Screen name="tickets" options={{ title: 'Tickets' }} />
    <Tabs.Screen name="chat" options={{ title: 'Team Chat' }} />
  </Tabs>;
}
