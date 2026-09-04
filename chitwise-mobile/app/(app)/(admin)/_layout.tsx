import { useEffect } from 'react';
import { Tabs, useRouter } from 'expo-router';
import { Text, Platform, StyleSheet, Modal, View, TouchableOpacity, Pressable } from 'react-native';
import { BlurView } from 'expo-blur';
import { useQuery } from '@tanstack/react-query';
import { C } from '../../../components/ui';
import { useUIStore } from '../../../store/uiStore';
import { getAuditLogs, getBillingInfo } from '../../../services/api';

function TabIcon({ name, focused }: { name: string; focused: boolean }) {
  const icons: Record<string, string> = {
    index:    '⌂',
    members:  '◉',
    chits:    '≡',
    payments: '₹',
    more:     '···',
  };
  return (
    <Text style={{ fontSize: name === 'more' ? 14 : 18, color: focused ? C.navy : C.gray400, marginBottom: -2 }}>
      {icons[name] ?? '●'}
    </Text>
  );
}

export default function AdminLayout() {
  const { activityBadge, setActivityBadge, activityLastSeenAt, loadActivityLastSeen,
    planExpiredVisible, hidePlanExpired, setIsExpired } = useUIStore();
  const router = useRouter();

  useEffect(() => {
    loadActivityLastSeen();
  }, []);

  const { data: billing } = useQuery({ queryKey: ['m-billing'], queryFn: getBillingInfo, staleTime: 300_000 });
  useEffect(() => {
    const expiry = (billing as any)?.planExpiresAt;
    setIsExpired(!!(expiry && new Date(expiry) < new Date()));
  }, [billing]);

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
    <>
    <Modal transparent animationType="fade" visible={planExpiredVisible} onRequestClose={hidePlanExpired}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', padding: 24 }} onPress={hidePlanExpired}>
        <Pressable style={{ backgroundColor: '#fff', borderRadius: 20, padding: 24, width: '100%', maxWidth: 340 }} onPress={() => {}}>
          <Text style={{ fontSize: 28, textAlign: 'center', marginBottom: 4 }}>🚫</Text>
          <Text style={{ fontSize: 17, fontWeight: '700', color: '#111827', textAlign: 'center', marginBottom: 8 }}>Subscription Expired</Text>
          <Text style={{ fontSize: 14, color: '#6B7280', textAlign: 'center', lineHeight: 21, marginBottom: 20 }}>
            Your plan has expired. Please renew to continue managing chits, members, and transactions.
          </Text>
          <TouchableOpacity
            onPress={() => { hidePlanExpired(); router.push('/(app)/(admin)/billing'); }}
            style={{ backgroundColor: '#DC2626', borderRadius: 12, paddingVertical: 13, marginBottom: 10 }}
          >
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15, textAlign: 'center' }}>Renew Plan</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={hidePlanExpired} style={{ paddingVertical: 10 }}>
            <Text style={{ color: '#6B7280', fontSize: 14, textAlign: 'center' }}>Dismiss</Text>
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
      {/* ── Visible tabs (5) ─────────────────────────────────────── */}
      <Tabs.Screen name="index"    options={{ title: 'Dashboard' }} />
      <Tabs.Screen name="members"  options={{ title: 'Members' }} />
      <Tabs.Screen name="chits"    options={{ title: 'Chits' }} />
      <Tabs.Screen name="payments" options={{ title: 'Finance' }} />
      <Tabs.Screen name="more"     options={{
        title: 'More',
        tabBarBadge: activityBadge > 0 ? activityBadge : undefined,
        tabBarBadgeStyle: { fontSize: 10, minWidth: 16, height: 16 },
      }} />

      {/* ── Hidden screens (accessible via More / deep links) ────── */}
      <Tabs.Screen name="activity" options={{ href: null }} />
      <Tabs.Screen name="reports"  options={{ href: null }} />
      <Tabs.Screen name="team"     options={{ href: null }} />
      <Tabs.Screen name="billing"  options={{ href: null }} />
      <Tabs.Screen name="roles"    options={{ href: null }} />
      <Tabs.Screen name="messages" options={{ href: null }} />
      <Tabs.Screen name="groups"   options={{ href: null }} />
    </Tabs>
    </>
  );
}
