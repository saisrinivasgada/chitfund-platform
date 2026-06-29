import { View, Text, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../../../store/authStore';
import { getMyChits, getMyRequests } from '../../../services/api';
import { C, T, Card, Badge, Amount, StatCard, fmtDate, LoadingScreen, SectionHeader, Divider } from '../../../components/ui';

export default function MemberHomeScreen() {
  const { user, logout } = useAuthStore();
  const router = useRouter();

  const { data: chits = [], isLoading: chitsLoading, refetch: refetchChits } = useQuery({
    queryKey: ['member-chits'],
    queryFn: getMyChits,
  });

  const { data: requests = [], isLoading: reqLoading, refetch: refetchReqs } = useQuery({
    queryKey: ['member-requests'],
    queryFn: getMyRequests,
  });

  const isLoading = chitsLoading || reqLoading;

  const activeChits  = (chits as any[]).filter((c) => c.status === 'ACTIVE');
  const pendingReqs  = (requests as any[]).filter((r) => ['PENDING', 'ASSIGNED', 'PICKED_UP'].includes(r.status));

  function onRefresh() { refetchChits(); refetchReqs(); }

  if (isLoading) return <LoadingScreen />;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.gray50 }}>
      <ScrollView
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={onRefresh} tintColor={C.navy} />}
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero header */}
        <View style={{
          backgroundColor: C.navy, borderRadius: 20, padding: 20, marginBottom: 20,
          shadowColor: C.navy, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 12,
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <View>
              <Text style={{ fontSize: 13, color: C.white + '88', fontWeight: '500' }}>Welcome back</Text>
              <Text style={{ fontSize: 22, fontWeight: '800', color: C.white, marginTop: 2 }}>
                {user?.fullName?.split(' ')[0] ?? 'Member'}
              </Text>
            </View>
            <View style={{
              width: 44, height: 44, borderRadius: 22,
              backgroundColor: C.gold, alignItems: 'center', justifyContent: 'center',
            }}>
              <Text style={{ fontSize: 20, fontWeight: '800', color: C.white }}>
                {(user?.fullName ?? user?.username ?? '?')[0].toUpperCase()}
              </Text>
            </View>
          </View>

          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1, backgroundColor: C.white + '1A', borderRadius: 12, padding: 12 }}>
              <Text style={{ fontSize: 11, color: C.white + '88', marginBottom: 4 }}>ACTIVE CHITS</Text>
              <Text style={{ fontSize: 24, fontWeight: '800', color: C.white }}>{activeChits.length}</Text>
            </View>
            <View style={{ flex: 1, backgroundColor: C.white + '1A', borderRadius: 12, padding: 12 }}>
              <Text style={{ fontSize: 11, color: C.white + '88', marginBottom: 4 }}>PENDING PICKUPS</Text>
              <Text style={{ fontSize: 24, fontWeight: '800', color: pendingReqs.length > 0 ? C.goldLight : C.white }}>
                {pendingReqs.length}
              </Text>
            </View>
          </View>
        </View>

        {/* Active cash requests */}
        {pendingReqs.length > 0 && (
          <View style={{ marginBottom: 20 }}>
            <SectionHeader title="Cash Pickup Status" />
            {pendingReqs.map((r: any) => (
              <Card key={r.id} style={{ marginBottom: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <Amount value={r.requestedAmount} size="sm" />
                  <Badge status={r.status} />
                </View>
                <Text style={{ fontSize: 12, color: C.gray500 }}>
                  {r.status === 'PENDING'   && 'Waiting for worker assignment'}
                  {r.status === 'ASSIGNED'  && 'Worker assigned — they will visit you soon'}
                  {r.status === 'PICKED_UP' && 'Worker collected your cash — awaiting admin confirmation'}
                </Text>
                <Text style={{ fontSize: 11, color: C.gray400, marginTop: 4 }}>Requested {fmtDate(r.requestedAt)}</Text>
              </Card>
            ))}
          </View>
        )}

        {/* My Chits preview */}
        <View>
          <SectionHeader
            title="My Chit Funds"
            action={
              <TouchableOpacity onPress={() => router.push('/(app)/(member)/chits')}>
                <Text style={{ fontSize: 13, color: C.navy, fontWeight: '600' }}>See all →</Text>
              </TouchableOpacity>
            }
          />
          {activeChits.length === 0 ? (
            <Text style={{ textAlign: 'center', color: C.gray400, fontSize: 14, paddingVertical: 20 }}>
              No active chit funds
            </Text>
          ) : (
            activeChits.slice(0, 3).map((c: any) => (
              <Card key={c.id} style={{ marginBottom: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: C.navy }} numberOfLines={1}>{c.name}</Text>
                    <Text style={{ fontSize: 12, color: C.gray500, marginTop: 3 }}>
                      Draw {c.currentDraw ?? 1}/{c.totalDraws ?? '?'}
                    </Text>
                  </View>
                  <Amount value={c.installmentAmount ?? 0} size="sm" />
                </View>
              </Card>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
