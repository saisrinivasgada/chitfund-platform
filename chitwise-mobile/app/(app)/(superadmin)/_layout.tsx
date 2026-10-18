import { Tabs } from 'expo-router';
import { C } from '../../../components/ui';
import { NeumorphicTabBackground, NeumorphicTabIcon, useNeumorphicTabBarStyle, neumorphicTabItemStyle, neumorphicTabLabelStyle, selectedTabBackgroundColor, RoundedTabButton } from '../../../components/NeumorphicTabs';

export default function SuperAdminLayout() {
  const tabBarStyle = useNeumorphicTabBarStyle();
  return (
    <Tabs screenOptions={({ route }) => ({
      headerShown: false,
      tabBarIcon: ({ focused }) => <NeumorphicTabIcon focused={focused} glyph={route.name === 'tickets' ? '🎫' : route.name === 'hub-chat' ? '💬' : route.name === 'employees' ? '👥' : '⚙'} size={17} />,
      tabBarActiveTintColor: C.white,
        tabBarActiveBackgroundColor: selectedTabBackgroundColor,
        tabBarButton: RoundedTabButton,
      tabBarInactiveTintColor: C.gray400,
      tabBarBackground: NeumorphicTabBackground,
      tabBarStyle,
      tabBarItemStyle: neumorphicTabItemStyle,
      tabBarLabelStyle: neumorphicTabLabelStyle,
    })}>
      <Tabs.Screen name="index" options={{ title: 'Platform' }} />
      <Tabs.Screen name="tickets" options={{ title: 'Tickets' }} />
      <Tabs.Screen name="hub-chat" options={{ title: 'Team Chat' }} />
      <Tabs.Screen name="employees" options={{ title: 'Employees' }} />
      <Tabs.Screen name="alerts" options={{ href: null }} />
      <Tabs.Screen name="billing" options={{ href: null }} />
      <Tabs.Screen name="helpdesk" options={{ href: null }} />
      <Tabs.Screen name="org-detail" options={{ href: null }} />
      <Tabs.Screen name="plans" options={{ href: null }} />
      <Tabs.Screen name="promotions" options={{ href: null }} />
    </Tabs>
  );
}
