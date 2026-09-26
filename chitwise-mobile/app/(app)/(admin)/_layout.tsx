import { useEffect } from 'react';
import { Tabs, useRouter } from 'expo-router';
import { Text, Platform, StyleSheet, Modal, View, TouchableOpacity, Pressable } from 'react-native';
import { BlurView } from 'expo-blur';
import { useQuery } from '@tanstack/react-query';
import { C } from '../../../components/ui';
import { useUIStore } from '../../../store/uiStore';
import { getAuditLogs, getBillingInfo } from '../../../services/api';
import { useAdminStartupPrefetch } from '../../../offline/useStartupPrefetch';

function TabIcon({ name, focused }: { name: string; focused: boolean }) {
  const icons: Record<string, string> = {
    index:    '⌂',
    members:  '◉',
    chits:    '≡',
    payments: '₹',
    more:     '···',
  };
  return (
    <View style={[styles.tabIcon, focused && styles.tabIconActive]}>
      <Text style={{
        fontSize: name === 'more' ? 15 : 19,
        lineHeight: 22,
        fontWeight: '800',
        color: focused ? C.white : C.gray400,
      }}>
        {icons[name] ?? '●'}
      </Text>
    </View>
  );
}

export default function AdminLayout() {
  const { activityBadge, setActivityBadge, activityLastSeenAt, loadActivityLastSeen,
    planExpiredVisible, hidePlanExpired, setIsExpired } = useUIStore();
  const router = useRouter();

  useAdminStartupPrefetch();

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
        <Pressable style={{ backgroundColor: C.surface, borderRadius: 20, padding: 24, width: '100%', maxWidth: 340 }} onPress={() => {}}>
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
        tabBarBackground: () => (
          <BlurView intensity={Platform.OS === 'ios' ? 72 : 0} tint="light" style={[StyleSheet.absoluteFill, styles.tabBackground]} />
        ),
        tabBarStyle: {
          backgroundColor: 'transparent',
          borderTopWidth: 0,
          height: Platform.OS === 'ios' ? 91 : 72,
          paddingBottom: Platform.OS === 'ios' ? 23 : 7,
          paddingTop: 7,
          paddingHorizontal: 7,
          shadowColor: '#8290A1',
          shadowOffset: { width: 0, height: -7 },
          shadowOpacity: 0.28,
          shadowRadius: 15,
          elevation: 16,
        },
        tabBarItemStyle: { borderRadius: 18 },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '700', marginTop: 1 },
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
      <Tabs.Screen name="messages"   options={{ href: null }} />
      <Tabs.Screen name="groups"     options={{ href: null }} />
      <Tabs.Screen name="my-account" options={{ href: null }} />
      <Tabs.Screen name="support"    options={{ href: null }} />
      <Tabs.Screen name="my-org"     options={{ href: null }} />
      <Tabs.Screen name="notes"      options={{ href: null }} />
    </Tabs>
    </>
  );
}

const styles = StyleSheet.create({
  tabBackground: {
    backgroundColor: Platform.OS === 'ios' ? 'rgba(232,237,243,0.90)' : '#E8EDF3',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: 'rgba(255,255,255,0.88)',
    overflow: 'hidden',
  },
  tabIcon: {
    width: 40,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabIconActive: {
    backgroundColor: C.navy,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.45)',
    shadowColor: C.navy,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.28,
    shadowRadius: 8,
    elevation: 6,
  },
});
