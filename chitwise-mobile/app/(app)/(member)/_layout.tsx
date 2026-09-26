import { Tabs } from 'expo-router';
import { C } from '../../../components/ui';
import { NeumorphicTabBackground, NeumorphicTabIcon, neumorphicTabBarStyle, neumorphicTabItemStyle, neumorphicTabLabelStyle } from '../../../components/NeumorphicTabs';
import { useReminderSync } from '../../../hooks/useReminderSync';
import { useMemberStartupPrefetch } from '../../../offline/useStartupPrefetch';

function TabIcon({ name, focused }: { name: string; focused: boolean }) {
  const icons: Record<string, string> = {
    index:     '⌂',
    chits:     '≡',
    reminders: '🔔',
    requests:  '↩',
    more:      '···',
  };
  return <NeumorphicTabIcon glyph={icons[name] ?? '●'} focused={focused} size={name === 'more' ? 15 : 19} />;
}

export default function MemberLayout() {
  useReminderSync();
  useMemberStartupPrefetch();
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
      {/* ── Visible tabs (5) ─────────────────────────────────────── */}
      <Tabs.Screen name="index"     options={{ title: 'Home' }} />
      <Tabs.Screen name="chits"     options={{ title: 'My Chits' }} />
      <Tabs.Screen name="reminders" options={{ title: 'Reminders' }} />
      <Tabs.Screen name="requests"  options={{ title: 'Requests' }} />
      <Tabs.Screen name="more"      options={{ title: 'More' }} />

      {/* ── Hidden (accessible via More or deep links) ───────────── */}
      <Tabs.Screen name="payments"    options={{ href: null }} />
      <Tabs.Screen name="invitations" options={{ href: null }} />
      <Tabs.Screen name="chitfund-requests" options={{ href: null }} />
      <Tabs.Screen name="payouts"     options={{ href: null }} />
      <Tabs.Screen name="messages"    options={{ href: null }} />
      <Tabs.Screen name="groups"      options={{ href: null }} />
      <Tabs.Screen name="my-account"  options={{ href: null }} />
      <Tabs.Screen name="chit-detail" options={{ href: null }} />
      <Tabs.Screen name="support"     options={{ href: null }} />
    </Tabs>
  );
}
