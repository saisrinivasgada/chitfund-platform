import { View, Text, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../../../store/authStore';
import { getMyChits, getMyRequests, getMyMemberProfile, getMemberTotalBalance } from '../../../services/api';
import { C, T, Badge, Amount, GlassCard, fmtDate, LoadingScreen, SectionHeader } from '../../../components/ui';
import { ProfileAvatarButton } from '../../../components/ProfileAvatarButton';

export default function MemberHomeScreen() {
  const { user } = useAuthStore();
  const router = useRouter();

  const { data: chits = [], isLoading: chitsLoading, refetch: refetchChits } = useQuery({
    queryKey: ['member-chits'],
    queryFn: getMyChits,
  });

  const { data: requests = [], isLoading: reqLoading, refetch: refetchReqs } = useQuery({
    queryKey: ['member-requests'],
    queryFn: getMyRequests,
  });

  const { data: memberProfile } = useQuery({
    queryKey: ['member-profile-me'],
    queryFn: getMyMemberProfile,
  });

  const memberId = memberProfile?.id;

  const { data: totalBalance } = useQuery({
    queryKey: ['member-total-balance', memberId],
    queryFn: () => getMemberTotalBalance(memberId!),
    enabled: !!memberId,
  });

  const isLoading = chitsLoading || reqLoading;

  const activeChits    = (chits as any[]).filter((c) => c.status === 'ACTIVE');
  const completedChits = (chits as any[]).filter((c) => c.status === 'COMPLETED');
  const pendingReqs    = (requests as any[]).filter((r) => ['PENDING', 'ASSIGNED', 'PICKED_UP'].includes(r.status));

  function onRefresh() { refetchChits(); refetchReqs(); }

  if (isLoading) return <LoadingScreen />;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.gray50 }}>
      <ScrollView
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={onRefresh} tintColor={C.navy} />}
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero header — liquid glass on dark */}
        <View style={{
          backgroundColor: C.navy, borderRadius: 20, padding: 20, marginBottom: 20,
          overflow: 'hidden',
          shadowColor: C.navy, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.35, shadowRadius: 20, elevation: 12,
        }}>
          {/* Specular highlight */}
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 72, backgroundColor: 'rgba(255,255,255,0.08)', borderTopLeftRadius: 20, borderTopRightRadius: 20 }} />
          <View style={{ position: 'absolute', top: -24, left: -24, width: 140, height: 140, borderRadius: 70, backgroundColor: 'rgba(255,255,255,0.07)' }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <View>
              <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', fontWeight: '500' }}>Welcome back</Text>
              <Text style={{ fontSize: 22, fontWeight: '800', color: C.white, marginTop: 2 }}>
                {user?.fullName?.split(' ')[0] ?? 'Member'}
              </Text>
            </View>
            <ProfileAvatarButton size={44} />
          </View>

          {/* Balance card */}
          {totalBalance != null && (
            <View style={{ backgroundColor: C.white + '1A', borderRadius: 14, padding: 18, marginBottom: 16 }}>
              <Text style={{ fontSize: 11, color: C.white + '88', fontWeight: '700', letterSpacing: 1, marginBottom: 6 }}>
                {Number(totalBalance) < 0 ? 'CREDIT BALANCE' : 'OUTSTANDING BALANCE'}
              </Text>
              <Text style={{ fontSize: 32, fontWeight: '800',
                color: Number(totalBalance) > 0 ? C.goldLight
                  : Number(totalBalance) < 0 ? '#4ADE80'
                  : C.white }}>
                ₹{Math.abs(Number(totalBalance)).toLocaleString('en-IN')}
              </Text>
              {Number(totalBalance) > 0 && (
                <Text style={{ fontSize: 12, color: C.goldLight + 'CC', marginTop: 4 }}>Amount you owe across all chits</Text>
              )}
              {Number(totalBalance) < 0 && (
                <Text style={{ fontSize: 12, color: '#4ADE80', marginTop: 4 }}>
                  Credit available — offsets your next installment
                </Text>
              )}
              {Number(totalBalance) === 0 && (
                <Text style={{ fontSize: 12, color: C.white + '88', marginTop: 4 }}>All dues cleared</Text>
              )}
            </View>
          )}
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1, backgroundColor: C.white + '1A', borderRadius: 14, padding: 14 }}>
              <Text style={{ fontSize: 11, color: C.white + '88', fontWeight: '700', letterSpacing: 0.5, marginBottom: 6 }}>ACTIVE CHITS</Text>
              <Text style={{ fontSize: 26, fontWeight: '800', color: C.white }}>{activeChits.length}</Text>
            </View>
            <View style={{ flex: 1, backgroundColor: C.white + '1A', borderRadius: 14, padding: 14 }}>
              <Text style={{ fontSize: 11, color: C.white + '88', fontWeight: '700', letterSpacing: 0.5, marginBottom: 6 }}>COMPLETED</Text>
              <Text style={{ fontSize: 26, fontWeight: '800', color: C.white }}>{completedChits.length}</Text>
            </View>
            <View style={{ flex: 1, backgroundColor: C.white + '1A', borderRadius: 14, padding: 14 }}>
              <Text style={{ fontSize: 11, color: C.white + '88', fontWeight: '700', letterSpacing: 0.5, marginBottom: 6 }}>PICKUPS</Text>
              <Text style={{ fontSize: 26, fontWeight: '800', color: pendingReqs.length > 0 ? C.goldLight : C.white }}>
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
              <GlassCard key={r.id} style={{ marginBottom: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <Amount value={r.requestedAmount} size="sm" />
                  <Badge status={r.status} />
                </View>
                <Text style={{ fontSize: 12, color: C.gray500 }}>
                  {r.status === 'PENDING'   && 'Waiting for staff assignment'}
                  {r.status === 'ASSIGNED'  && 'Staff assigned — they will visit you soon'}
                  {r.status === 'PICKED_UP' && 'Staff collected your cash — awaiting admin confirmation'}
                </Text>
                <Text style={{ fontSize: 11, color: C.gray400, marginTop: 4 }}>Requested {fmtDate(r.requestedAt)}</Text>
              </GlassCard>
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
              <GlassCard key={c.id} style={{ marginBottom: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: C.navy }} numberOfLines={1}>{c.name}</Text>
                    <Text style={{ fontSize: 12, color: C.gray500, marginTop: 3 }}>
                      Draw {c.currentDraw ?? 1}/{c.totalDraws ?? '?'}
                    </Text>
                  </View>
                  <Amount value={c.installmentAmount ?? 0} size="sm" />
                </View>
              </GlassCard>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
