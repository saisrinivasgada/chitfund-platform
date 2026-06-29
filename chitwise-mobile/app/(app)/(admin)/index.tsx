import { View, Text, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../../../store/authStore';
import { getActiveCashRequests, getChits, getMembers } from '../../../services/api';
import { C, T, Card, StatCard, Badge, Amount, fmtDateTime, LoadingScreen, SectionHeader } from '../../../components/ui';

export default function AdminDashboard() {
  const { user, logout } = useAuthStore();
  const router = useRouter();

  const { data: cashRequests = [], isLoading: crLoading, refetch: refetchCR } = useQuery({
    queryKey: ['mobile-cash-requests'],
    queryFn: getActiveCashRequests,
  });

  const { data: chits = [], isLoading: chitsLoading, refetch: refetchChits } = useQuery({
    queryKey: ['mobile-chits'],
    queryFn: getChits,
  });

  const { data: members = [], isLoading: membersLoading, refetch: refetchMembers } = useQuery({
    queryKey: ['mobile-members'],
    queryFn: getMembers,
  });

  const isLoading = crLoading || chitsLoading || membersLoading;
  const refreshing = isLoading;

  const activeChits     = (chits as any[]).filter((c) => c.status === 'ACTIVE');
  const activeMembers   = (members as any[]).filter((m) => m.status === 'ACTIVE' || !m.status);
  const pendingPickups  = (cashRequests as any[]).filter((r) => r.status === 'PICKED_UP');
  const pendingRequests = (cashRequests as any[]).filter((r) => r.status === 'PENDING');

  function onRefresh() {
    refetchCR(); refetchChits(); refetchMembers();
  }

  if (isLoading) return <LoadingScreen />;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.gray50 }}>
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.navy} />}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
      >
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <View>
            <Text style={T.h1}>Dashboard</Text>
            <Text style={{ fontSize: 13, color: C.gray500, marginTop: 2 }}>
              Hello, {user?.fullName?.split(' ')[0] ?? 'Admin'} 👋
            </Text>
          </View>
          <TouchableOpacity
            onPress={logout}
            style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, borderWidth: 1.5, borderColor: C.gray300 }}
          >
            <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray600 }}>Logout</Text>
          </TouchableOpacity>
        </View>

        {/* Stats grid */}
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
          <StatCard label="Active Chits"   value={String(activeChits.length)}   accent={C.navy} />
          <StatCard label="Active Members" value={String(activeMembers.length)} accent={C.green} />
        </View>
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
          <StatCard label="Pending Pickups" value={String(pendingPickups.length)}  accent={C.amber} />
          <StatCard label="New Requests"    value={String(pendingRequests.length)} accent={C.red} />
        </View>

        {/* Cash Requests that need action */}
        {pendingPickups.length > 0 && (
          <View style={{ marginBottom: 20 }}>
            <SectionHeader
              title="Ready to Collect"
              action={
                <TouchableOpacity onPress={() => router.push('/(app)/(admin)/payments')}>
                  <Text style={{ fontSize: 13, color: C.navy, fontWeight: '600' }}>See all →</Text>
                </TouchableOpacity>
              }
            />
            {pendingPickups.slice(0, 3).map((r: any) => (
              <Card key={r.id} style={{ marginBottom: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: C.gray900 }}>
                      Member {r.memberId?.slice(0, 8)}…
                    </Text>
                    <Amount value={r.requestedAmount} size="sm" color={C.green} />
                    <Text style={{ fontSize: 11, color: C.gray400, marginTop: 2 }}>
                      Picked up {fmtDateTime(r.pickedUpAt)}
                    </Text>
                  </View>
                  <Badge status="PICKED_UP" />
                </View>
              </Card>
            ))}
          </View>
        )}

        {/* Active Chits summary */}
        <View style={{ marginBottom: 20 }}>
          <SectionHeader
            title="Active Chits"
            action={
              <TouchableOpacity onPress={() => router.push('/(app)/(admin)/chits')}>
                <Text style={{ fontSize: 13, color: C.navy, fontWeight: '600' }}>See all →</Text>
              </TouchableOpacity>
            }
          />
          {activeChits.slice(0, 4).map((c: any) => (
            <Card key={c.id} style={{ marginBottom: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: C.gray900 }}>{c.name}</Text>
                  <Text style={{ fontSize: 12, color: C.gray500, marginTop: 2 }}>
                    {c.totalMembers ?? 0} members · Draw {c.currentDraw ?? 1}/{c.totalDraws ?? '?'}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <Badge status={c.status} />
                  {c.installmentAmount && <Amount value={c.installmentAmount} size="sm" />}
                </View>
              </View>
            </Card>
          ))}
          {activeChits.length === 0 && (
            <Text style={{ textAlign: 'center', color: C.gray400, fontSize: 14, paddingVertical: 20 }}>
              No active chits
            </Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
