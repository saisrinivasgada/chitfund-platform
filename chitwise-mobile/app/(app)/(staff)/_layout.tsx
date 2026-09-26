import { Tabs } from 'expo-router';
import { C } from '../../../components/ui';
import { NeumorphicTabBackground, NeumorphicTabIcon, neumorphicTabBarStyle, neumorphicTabItemStyle, neumorphicTabLabelStyle } from '../../../components/NeumorphicTabs';
import { useStaffStartupPrefetch } from '../../../offline/useStartupPrefetch';

function TabIcon({ name, focused }: { name: string; focused: boolean }) {
  const icons: Record<string, string> = { index: '◈', history: '≡' };
  return <NeumorphicTabIcon glyph={icons[name] ?? '●'} focused={focused} />;
}

export default function StaffLayout() {
  useStaffStartupPrefetch();
  return (
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
      <Tabs.Screen name="index"   options={{ title: 'My Tasks' }} />
      <Tabs.Screen name="history" options={{ title: 'History' }} />
    </Tabs>
  );
}
