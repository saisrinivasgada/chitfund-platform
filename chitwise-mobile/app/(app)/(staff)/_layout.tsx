import { Tabs } from 'expo-router';
import { C } from '../../../components/ui';
import { NeumorphicTabBackground, NeumorphicTabIcon, useNeumorphicTabBarStyle, neumorphicTabItemStyle, neumorphicTabLabelStyle, selectedTabBackgroundColor, RoundedTabButton } from '../../../components/NeumorphicTabs';
import { useStaffStartupPrefetch } from '../../../offline/useStartupPrefetch';
import { useEntitlementRefresh } from '../../../hooks/useEntitlementRefresh';

function TabIcon({ name, focused }: { name: string; focused: boolean }) {
  const icons: Record<string, string> = { index: '◈', history: '≡', more: '···' };
  return <NeumorphicTabIcon glyph={icons[name] ?? '●'} focused={focused} />;
}

export default function StaffLayout() {
  const tabBarStyle = useNeumorphicTabBarStyle();
  useStaffStartupPrefetch();
  useEntitlementRefresh();
  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ focused }) => <TabIcon name={route.name} focused={focused} />,
        tabBarActiveTintColor: C.white,
        tabBarActiveBackgroundColor: selectedTabBackgroundColor,
        tabBarButton: RoundedTabButton,
        tabBarInactiveTintColor: C.gray400,
        tabBarBackground: NeumorphicTabBackground,
        tabBarStyle,
        tabBarItemStyle: neumorphicTabItemStyle,
        tabBarLabelStyle: neumorphicTabLabelStyle,
      })}
    >
      <Tabs.Screen name="index"   options={{ title: 'My Tasks' }} />
      <Tabs.Screen name="history" options={{ title: 'History' }} />
      <Tabs.Screen name="more"    options={{ title: 'More' }} />
    </Tabs>
  );
}
