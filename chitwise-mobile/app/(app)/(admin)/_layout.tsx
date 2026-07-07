import { useEffect } from 'react';
import { Tabs } from 'expo-router';
import { Text, Platform, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import { useQuery } from '@tanstack/react-query';
import { C } from '../../../components/ui';
import { useUIStore } from '../../../store/uiStore';
import { getAuditLogs } from '../../../services/api';

function TabIcon({ name, focused }: { name: string; focused: boolean }) {
  const icons: Record<string, string> = {
    index:    '⌂',
    members:  '◉',
    payments: '₹',
    chits:    '≡',
    activity: '◈',
    team:     '✦',
  };
  return (
    <Text style={{ fontSize: 18, color: focused ? C.navy : C.gray400, marginBottom: -2 }}>
      {icons[name] ?? '●'}
    </Text>
  );
}

export default function AdminLayout() {
  const { activityBadge, setActivityBadge, activityLastSeenAt, loadActivityLastSeen } = useUIStore();

  useEffect(() => {
    loadActivityLastSeen();
  }, []);

  const { data: recentLogs = [] } = useQuery({
    queryKey: ['m-activity-badge-poll'],
    queryFn: () => getAuditLogs({ size: 20, sort: 'createdAt,desc' }),
    refetchInterval: 30_000,
    enabled: !!activityLastSeenAt,
  });

  useEffect(() => {
    if (!activityLastSeenAt || !(recentLogs as any[]).length) return;
    const n = (recentLogs as any[]).filter(
      (e) => new Date(e.createdAt) > new Date(activityLastSeenAt!)
    ).length;
    setActivityBadge(n);
  }, [recentLogs, activityLastSeenAt]);

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
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600' },
      })}
    >
      <Tabs.Screen name="index"    options={{ title: 'Dashboard' }} />
      <Tabs.Screen name="members"  options={{ title: 'Members' }} />
      <Tabs.Screen name="chits"    options={{ title: 'Chits' }} />
      <Tabs.Screen name="payments" options={{ title: 'Finance' }} />
      <Tabs.Screen name="team"     options={{ title: 'Team' }} />
      <Tabs.Screen name="activity" options={{
        title: 'Activity',
        tabBarBadge: activityBadge > 0 ? activityBadge : undefined,
        tabBarBadgeStyle: { fontSize: 10, minWidth: 16, height: 16 },
      }} />
    </Tabs>
  );
}
