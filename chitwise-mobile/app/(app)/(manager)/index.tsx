import { useState } from 'react';
import { View, Text, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../../../store/authStore';
import {
  getTodaysDraws, getTodaysPaymentBatches, getTodaysPayouts,
  getPendingRemittance, getPendingPayouts, getWalletBalance,
  getMembers, getChits, getActiveCashRequests,
} from '../../../services/api';
import { C, T, Card, Badge, Amount, StatCard, SectionHeader, LoadingScreen, fmtDate, Divider } from '../../../components/ui';
import EditProfileModal from '../../../components/EditProfileModal';

export default function ManagerDashboardScreen() {
  const { user } = useAuthStore();
  const [showProfile, setShowProfile] = useState(false);

  const { data: todayDraws = [],    isLoading: l1, refetch: r1 } = useQuery({ queryKey: ['today-draws'],    queryFn: getTodaysDraws });
  const { data: todayBatches = [],  isLoading: l2, refetch: r2 } = useQuery({ queryKey: ['today-batches'],  queryFn: getTodaysPaymentBatches });
  const { data: pendingRemit = [],  isLoading: l3, refetch: r3 } = useQuery({ queryKey: ['pending-remit'],  queryFn: getPendingRemittance });
  const { data: pendingPayouts = [],isLoading: l4, refetch: r4 } = useQuery({ queryKey: ['pending-payouts'],queryFn: getPendingPayouts });
  const { data: cashRequests = [],  isLoading: l5, refetch: r5 } = useQuery({ queryKey: ['cash-requests'],  queryFn: getActiveCashRequests });
  const { data: walletBal }                                        = useQuery({ queryKey: ['wallet-balance'],queryFn: getWalletBalance });
  const { data: members = [] }                                     = useQuery({ queryKey: ['members'],       queryFn: getMembers });
  const { data: chits = [] }                                       = useQuery({ queryKey: ['chits'],         queryFn: getChits });

  const isLoading = l1 || l2 || l3 || l4 || l5;
  function onRefresh() { r1(); r2(); r3(); r4(); r5(); }

  const memberMap: Record<string, string> = {};
  (members as any[]).forEach((m: any) => { memberMap[m.id] = m.fullName ?? m.name ?? '—'; });
  const chitMap: Record<string, string> = {};
  (chits as any[]).forEach((c: any) => { chitMap[c.id] = c.name; });

  const activeChits     = (chits as any[]).filter((c: any) => c.status === 'ACTIVE').length;
  const activeMembers   = (members as any[]).filter((m: any) => m.status === 'ACTIVE').length;
  const pendingPickups  = (cashRequests as any[]).filter((r: any) => r.status === 'PENDING').length;
  const assignedPickups = (cashRequests as any[]).filter((r: any) => r.status === 'ASSIGNED').length;

  const todayCollected = (todayBatches as any[]).reduce((sum: number, b: any) => sum + (b.amount ?? b.totalAmount ?? 0), 0);
  const treasuryBalance = (walletBal as any)?.totalBalance ?? (walletBal as any)?.cashBalance ?? 0;

  if (isLoading) return <LoadingScreen />;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.gray50 }}>
      <ScrollView
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={onRefresh} tintColor={C.navy} />}
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <View>
            <Text style={{ fontSize: 13, color: C.gray500 }}>Manager View</Text>
            <Text style={T.h1}>{user?.fullName?.split(' ')[0] ?? 'Manager'}</Text>
            <Text style={{ fontSize: 12, color: C.gray400 }}>{fmtDate(new Date().toISOString())}</Text>
          </View>
          <TouchableOpacity onPress={() => setShowProfile(true)}
            style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: C.navy, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: C.white }}>
              {(user?.fullName ?? user?.username ?? '?')[0].toUpperCase()}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Treasury balance */}
        <View style={{
          backgroundColor: C.navy, borderRadius: 20, padding: 20, marginBottom: 20,
          shadowColor: C.navy, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 12,
        }}>
          <Text style={{ fontSize: 12, color: C.white + '88', marginBottom: 6 }}>TREASURY BALANCE</Text>
          <Text style={{ fontSize: 32, fontWeight: '800', color: C.white }}>
            ₹{Number(treasuryBalance).toLocaleString('en-IN')}
          </Text>
          <View style={{ flexDirection: 'row', gap: 16, marginTop: 16 }}>
            <View style={{ backgroundColor: C.white + '1A', borderRadius: 10, padding: 10, flex: 1 }}>
              <Text style={{ fontSize: 10, color: C.white + '80' }}>ACTIVE CHITS</Text>
              <Text style={{ fontSize: 22, fontWeight: '800', color: C.white, marginTop: 2 }}>{activeChits}</Text>
            </View>
            <View style={{ backgroundColor: C.white + '1A', borderRadius: 10, padding: 10, flex: 1 }}>
              <Text style={{ fontSize: 10, color: C.white + '80' }}>MEMBERS</Text>
              <Text style={{ fontSize: 22, fontWeight: '800', color: C.white, marginTop: 2 }}>{activeMembers}</Text>
            </View>
            <View style={{ backgroundColor: C.white + '1A', borderRadius: 10, padding: 10, flex: 1 }}>
              <Text style={{ fontSize: 10, color: C.white + '80' }}>TODAY ₹</Text>
              <Text style={{ fontSize: 16, fontWeight: '800', color: todayCollected > 0 ? C.goldLight : C.white, marginTop: 2 }}>
                ₹{Number(todayCollected).toLocaleString('en-IN')}
              </Text>
            </View>
          </View>
        </View>

        {/* Action items that need attention */}
        <SectionHeader title="Needs Attention" />

        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
          <Card style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ fontSize: 26, fontWeight: '800', color: (pendingRemit as any[]).length > 0 ? C.amber : C.gray400 }}>
              {(pendingRemit as any[]).length}
            </Text>
            <Text style={{ fontSize: 11, color: C.gray500, textAlign: 'center', marginTop: 2 }}>Pending Remittance</Text>
          </Card>
          <Card style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ fontSize: 26, fontWeight: '800', color: (pendingPayouts as any[]).length > 0 ? '#7C3AED' : C.gray400 }}>
              {(pendingPayouts as any[]).length}
            </Text>
            <Text style={{ fontSize: 11, color: C.gray500, textAlign: 'center', marginTop: 2 }}>Pending Payouts</Text>
          </Card>
          <Card style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ fontSize: 26, fontWeight: '800', color: pendingPickups > 0 ? C.red : C.gray400 }}>
              {pendingPickups}
            </Text>
            <Text style={{ fontSize: 11, color: C.gray500, textAlign: 'center', marginTop: 2 }}>Unassigned Pickups</Text>
          </Card>
        </View>

        {/* Today's draws */}
        {(todayDraws as any[]).length > 0 && (
          <View style={{ marginBottom: 20 }}>
            <SectionHeader title={`Today's Draws (${(todayDraws as any[]).length})`} />
            {(todayDraws as any[]).map((d: any) => (
              <Card key={d.id} style={{ marginBottom: 10 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: C.navy }}>
                      {chitMap[d.chitId] ?? d.chitName ?? '—'}
                    </Text>
                    <Text style={{ fontSize: 12, color: C.gray500, marginTop: 2 }}>
                      Draw #{d.drawNumber ?? d.monthNumber ?? '—'}
                      {d.winner && ` · Winner: ${memberMap[d.winner?.memberId] ?? d.winner?.memberName ?? '—'}`}
                    </Text>
                  </View>
                  <Badge status={d.status} />
                </View>
              </Card>
            ))}
          </View>
        )}

        {/* Cash requests overview */}
        {assignedPickups > 0 && (
          <View style={{ marginBottom: 20 }}>
            <SectionHeader title={`Cash Pickups In Progress (${assignedPickups})`} />
            {(cashRequests as any[]).filter((r: any) => r.status === 'ASSIGNED').map((r: any) => (
              <Card key={r.id} style={{ marginBottom: 8 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: C.gray900 }}>
                      {memberMap[r.memberId] ?? `Member ${r.memberId?.slice(0, 8)}…`}
                    </Text>
                    <Text style={{ fontSize: 12, color: C.gray500, marginTop: 1 }}>
                      {chitMap[r.chitId] ?? '—'}
                    </Text>
                  </View>
                  <Amount value={r.requestedAmount} size="sm" />
                </View>
              </Card>
            ))}
          </View>
        )}

        {/* Pending remittance list */}
        {(pendingRemit as any[]).length > 0 && (
          <View style={{ marginBottom: 20 }}>
            <SectionHeader title={`Pending Remittance (${(pendingRemit as any[]).length})`} />
            {(pendingRemit as any[]).slice(0, 5).map((b: any) => (
              <Card key={b.id} style={{ marginBottom: 8, borderLeftWidth: 3, borderLeftColor: C.amber }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray900 }}>
                      {memberMap[b.memberId] ?? `Member ${b.memberId?.slice(0, 8)}…`}
                    </Text>
                    <Text style={{ fontSize: 12, color: C.gray500, marginTop: 1 }}>
                      {chitMap[b.chitId] ?? b.chitName ?? '—'}
                    </Text>
                  </View>
                  <Amount value={b.amount ?? b.totalAmount ?? 0} size="sm" color={C.amber} />
                </View>
              </Card>
            ))}
            {(pendingRemit as any[]).length > 5 && (
              <Text style={{ textAlign: 'center', color: C.gray400, fontSize: 12, marginTop: 4 }}>
                +{(pendingRemit as any[]).length - 5} more
              </Text>
            )}
          </View>
        )}

        {/* Pending payouts */}
        {(pendingPayouts as any[]).length > 0 && (
          <View style={{ marginBottom: 20 }}>
            <SectionHeader title={`Winners Awaiting Payout (${(pendingPayouts as any[]).length})`} />
            {(pendingPayouts as any[]).slice(0, 5).map((p: any) => (
              <Card key={p.id} style={{ marginBottom: 8, borderLeftWidth: 3, borderLeftColor: '#7C3AED' }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray900 }}>
                      {memberMap[p.memberId ?? p.winnerId] ?? '—'}
                    </Text>
                    <Text style={{ fontSize: 12, color: C.gray500, marginTop: 1 }}>
                      {chitMap[p.chitId] ?? '—'} · Draw #{p.drawNumber ?? '—'}
                    </Text>
                  </View>
                  <Amount value={p.netPayoutAmount ?? p.winningAmount ?? p.payoutAmount ?? 0} size="sm" color="#7C3AED" />
                </View>
              </Card>
            ))}
            {(pendingPayouts as any[]).length > 5 && (
              <Text style={{ textAlign: 'center', color: C.gray400, fontSize: 12, marginTop: 4 }}>
                +{(pendingPayouts as any[]).length - 5} more
              </Text>
            )}
          </View>
        )}
      </ScrollView>

      <EditProfileModal visible={showProfile} onClose={() => setShowProfile(false)} />
    </SafeAreaView>
  );
}
