import { useState } from 'react';
import { View, Text, FlatList, RefreshControl, TouchableOpacity, Modal, ScrollView } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getMyChits, getMyMemberProfile, getMemberBalance, getPaymentHistory, getDraws, getWinners, getPayoutsForMember } from '../../../services/api';
import { C, T, Card, Badge, Amount, EmptyState, LoadingScreen, Divider, fmtDate } from '../../../components/ui';
import { ProfileAvatarButton } from '../../../components/ProfileAvatarButton';

const MONTH_STATUS_COLOR: Record<string, string> = {
  SETTLED:             C.green,
  PARTIALLY_PAID:      C.amber,
  OUTSTANDING:         C.red,
  WAIVED:              C.gray400,
  PAYOUT_DEDUCTED:     '#7C3AED',
  SETTLEMENT_CLEARED:  '#0F766E',
};

const MONTH_STATUS_LABEL: Record<string, string> = {
  SETTLED:             'Settled',
  PARTIALLY_PAID:      'Partial',
  OUTSTANDING:         'Outstanding',
  WAIVED:              'Waived',
  PAYOUT_DEDUCTED:     'Payout Deducted',
  SETTLEMENT_CLEARED:  'Cleared',
};

function ChitBalance({ memberId, chitId }: { memberId: string; chitId: string }) {
  const { data: bal } = useQuery({
    queryKey: ['member-chit-balance', memberId, chitId],
    queryFn: () => getMemberBalance(memberId, chitId),
    staleTime: 60_000,
  });
  const owing = bal?.outstandingBalance ?? bal?.balance ?? bal ?? null;
  if (owing == null) return null;
  const num = Number(owing);
  return (
    <View style={{
      paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20,
      backgroundColor: num > 0 ? '#FEF3C7' : '#DCFCE7',
    }}>
      <Text style={{ fontSize: 11, fontWeight: '700', color: num > 0 ? '#92400E' : '#15803D' }}>
        {num > 0 ? `Owes ₹${num.toLocaleString('en-IN')}` : 'Paid up'}
      </Text>
    </View>
  );
}

function ChitDetailModal({ chit, memberId, onClose }: { chit: any; memberId: string; onClose: () => void }) {
  const { data: history = [], isLoading: histLoading } = useQuery({
    queryKey: ['member-chit-history', memberId, chit.id],
    queryFn: () => getPaymentHistory(memberId, chit.id),
    enabled: !!memberId && !!chit.id,
  });

  const { data: draws = [] } = useQuery({
    queryKey: ['member-chit-draws', chit.id],
    queryFn: () => getDraws(chit.id),
    enabled: !!chit.id,
  });

  const { data: winners = [] } = useQuery({
    queryKey: ['member-chit-winners', chit.id],
    queryFn: () => getWinners(chit.id),
    enabled: !!chit.id,
  });

  const { data: allPayouts = [] } = useQuery({
    queryKey: ['member-payouts', memberId],
    queryFn: () => getPayoutsForMember(memberId),
    enabled: !!memberId,
  });

  const winnerByMonth = Object.fromEntries((winners as any[]).map((w: any) => [w.monthNumber, w]));
  const myPayout = (allPayouts as any[]).find((p: any) => p.chitId === chit.id);
  const histArr = history as any[];
  const settledCount = histArr.filter((r: any) => ['SETTLED', 'WAIVED', 'PAYOUT_DEDUCTED', 'SETTLEMENT_CLEARED'].includes(r.status)).length;
  const totalPaid = histArr.reduce((s, r: any) => s + Number(r.amountPaid ?? 0), 0);
  const outstanding = histArr.reduce((s, r: any) => s + Math.max(0, Number(r.amountDue ?? 0) - Number(r.amountPaid ?? 0)), 0);

  return (
    <Modal visible animationType="slide" transparent presentationStyle="overFullScreen">
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' }}>
        <View style={{ backgroundColor: C.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '88%' }}>
          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderBottomWidth: 1, borderBottomColor: C.gray100 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 17, fontWeight: '700', color: C.navy }} numberOfLines={1}>{chit.name}</Text>
              <Text style={{ fontSize: 12, color: C.gray400, marginTop: 2 }}>Payment history</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={{ paddingLeft: 16 }}>
              <Text style={{ fontSize: 22, color: C.gray400 }}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 20, paddingBottom: 32 }}>
            {/* Summary row */}
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
              <View style={{ flex: 1, backgroundColor: C.gray50, borderRadius: 14, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: C.gray100 }}>
                <Text style={{ fontSize: 11, color: C.gray400 }}>Months Paid</Text>
                <Text style={{ fontSize: 20, fontWeight: '800', color: C.gray900, marginTop: 2 }}>
                  {settledCount}<Text style={{ fontSize: 13, fontWeight: '400', color: C.gray400 }}>/{histArr.length}</Text>
                </Text>
              </View>
              <View style={{ flex: 1, borderRadius: 14, padding: 14, alignItems: 'center', backgroundColor: outstanding > 0 ? '#FFF5F5' : '#F0FDF4', borderWidth: 1, borderColor: outstanding > 0 ? '#FECACA' : '#BBF7D0' }}>
                <Text style={{ fontSize: 11, color: outstanding > 0 ? C.red : C.green }}>Outstanding</Text>
                <Text style={{ fontSize: 20, fontWeight: '800', color: outstanding > 0 ? C.red : C.green, marginTop: 2 }}>
                  {outstanding > 0 ? `₹${outstanding.toLocaleString('en-IN')}` : '₹0'}
                </Text>
              </View>
              <View style={{ flex: 1, backgroundColor: C.gray50, borderRadius: 14, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: C.gray100 }}>
                <Text style={{ fontSize: 11, color: C.gray400 }}>Total Paid</Text>
                <Text style={{ fontSize: 20, fontWeight: '800', color: C.gray900, marginTop: 2 }}>
                  ₹{totalPaid.toLocaleString('en-IN')}
                </Text>
              </View>
            </View>

            {/* My payout section */}
            {myPayout && (() => {
              const isDisbursed = myPayout.status === 'DISBURSED' || myPayout.status === 'PARTIALLY_DISBURSED';
              const color = isDisbursed ? C.green : C.amber;
              return (
                <View style={{ backgroundColor: isDisbursed ? '#F0FDF4' : '#FFFBEB', borderRadius: 14, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: isDisbursed ? '#BBF7D0' : '#FDE68A' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: C.navy }}>My Payout — Draw #{myPayout.monthNumber}</Text>
                    <View style={{ paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20, backgroundColor: color + '20' }}>
                      <Text style={{ fontSize: 11, fontWeight: '700', color }}>{isDisbursed ? 'Disbursed' : 'Pending'}</Text>
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 16 }}>
                    <View>
                      <Text style={{ fontSize: 10, color: C.gray400, textTransform: 'uppercase' }}>Won</Text>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: C.gray900 }}>₹{Number(myPayout.winningAmount ?? 0).toLocaleString('en-IN')}</Text>
                    </View>
                    <View>
                      <Text style={{ fontSize: 10, color: C.gray400, textTransform: 'uppercase' }}>Net</Text>
                      <Text style={{ fontSize: 14, fontWeight: '700', color }}>{`₹${Number(myPayout.netPayoutAmount ?? 0).toLocaleString('en-IN')}`}</Text>
                    </View>
                    {isDisbursed && myPayout.disbursedAt && (
                      <View>
                        <Text style={{ fontSize: 10, color: C.gray400, textTransform: 'uppercase' }}>Paid On</Text>
                        <Text style={{ fontSize: 12, fontWeight: '600', color: C.gray700 }}>{fmtDate(myPayout.disbursedAt)}</Text>
                      </View>
                    )}
                  </View>
                </View>
              );
            })()}

            {/* Draw-by-draw list */}
            {histLoading ? (
              <Text style={{ textAlign: 'center', color: C.gray400, padding: 20 }}>Loading…</Text>
            ) : histArr.length === 0 ? (
              <Text style={{ textAlign: 'center', color: C.gray400, padding: 20 }}>No payment records yet</Text>
            ) : (
              <View>
                <Text style={{ fontSize: 13, fontWeight: '700', color: C.gray700, marginBottom: 10 }}>Draw History</Text>
                {histArr.map((r: any) => {
                  const color = MONTH_STATUS_COLOR[r.status] ?? C.gray400;
                  const label = MONTH_STATUS_LABEL[r.status] ?? r.status;
                  const won = winnerByMonth[r.monthNumber] && winnerByMonth[r.monthNumber].memberId === memberId;
                  const pct = r.amountDue > 0 ? Math.min(100, Math.round((r.amountPaid / r.amountDue) * 100)) : 0;
                  return (
                    <View key={r.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: C.gray100, backgroundColor: C.white }}>
                      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ fontSize: 13, fontWeight: '800', color: C.white }}>{r.monthNumber}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                          <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray900 }}>Draw {r.monthNumber}</Text>
                          <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 20, backgroundColor: color + '18' }}>
                            <Text style={{ fontSize: 10, fontWeight: '700', color }}>{label}</Text>
                          </View>
                          {won && <Text style={{ fontSize: 10, fontWeight: '700', color: '#D4A017' }}>🏆 Won</Text>}
                        </View>
                        <View style={{ height: 4, backgroundColor: C.gray100, borderRadius: 2, marginBottom: 4 }}>
                          <View style={{ height: 4, borderRadius: 2, backgroundColor: color, width: `${pct}%` as any }} />
                        </View>
                        <Text style={{ fontSize: 11, color: C.gray500 }}>
                          ₹{Number(r.amountPaid ?? 0).toLocaleString('en-IN')} / ₹{Number(r.amountDue ?? 0).toLocaleString('en-IN')}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export default function MemberChitsScreen() {
  const [selected, setSelected] = useState<any>(null);

  const { data: chits = [], isLoading: chitsLoading, refetch } = useQuery({
    queryKey: ['member-chits'],
    queryFn: getMyChits,
  });

  const { data: memberProfile } = useQuery({
    queryKey: ['member-profile-me'],
    queryFn: getMyMemberProfile,
  });

  const memberId = memberProfile?.id;
  const isLoading = chitsLoading;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.gray50 }}>
      <FlatList
        data={chits as any[]}
        keyExtractor={(c: any) => c.id}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={C.navy} />}
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        ListHeaderComponent={
          <View style={{ marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={T.h1}>My Chit Funds</Text>
              <ProfileAvatarButton size={34} />
            </View>
            <Text style={{ fontSize: 13, color: C.gray500, marginTop: 2 }}>
              {(chits as any[]).filter((c: any) => c.status === 'ACTIVE').length} active · tap to see details
            </Text>
          </View>
        }
        ListEmptyComponent={
          <EmptyState title="No chit funds" message="You haven't been enrolled in any chit funds yet." />
        }
        renderItem={({ item: c }) => (
          <TouchableOpacity activeOpacity={0.85} onPress={() => setSelected(c)}>
            <Card style={{ marginBottom: 14 }}>
              {/* Chit name + status */}
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6 }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: C.navy, flex: 1 }} numberOfLines={2}>{c.name}</Text>
                <Badge status={c.status} />
              </View>
              {c.chitType === 'LOTTERY' && (
                <View style={{ alignSelf: 'flex-start', backgroundColor: '#F5F3FF', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, marginBottom: 8 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#7C3AED' }}>🎲 LOTTERY</Text>
                </View>
              )}
              {memberId && (
                <View style={{ marginBottom: 8 }}>
                  <ChitBalance memberId={memberId} chitId={c.id} />
                </View>
              )}

              {/* Key stats */}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginBottom: 10 }}>
                <View>
                  <Text style={{ fontSize: 10, color: C.gray400, marginBottom: 2, textTransform: 'uppercase' }}>Monthly</Text>
                  <Amount value={c.installmentAmount ?? 0} size="sm" />
                </View>
                <View>
                  <Text style={{ fontSize: 10, color: C.gray400, marginBottom: 2, textTransform: 'uppercase' }}>Draw</Text>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: C.gray900 }}>
                    {c.currentDraw ?? 1} / {c.totalDraws ?? '?'}
                  </Text>
                </View>
                {c.totalAmount && (
                  <View>
                    <Text style={{ fontSize: 10, color: C.gray400, marginBottom: 2, textTransform: 'uppercase' }}>Total Value</Text>
                    <Amount value={c.totalAmount} size="sm" color={C.green} />
                  </View>
                )}
              </View>

              {/* Progress bar */}
              {c.totalDraws && c.currentDraw && (
                <>
                  <Divider />
                  <View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                      <Text style={{ fontSize: 11, color: C.gray400 }}>Progress</Text>
                      <Text style={{ fontSize: 11, color: C.navy, fontWeight: '600' }}>
                        {Math.round((c.currentDraw / c.totalDraws) * 100)}%
                      </Text>
                    </View>
                    <View style={{ height: 6, backgroundColor: C.gray200, borderRadius: 3 }}>
                      <View style={{
                        height: 6, borderRadius: 3,
                        backgroundColor: c.status === 'COMPLETED' ? C.green : C.navy,
                        width: `${Math.min(100, (c.currentDraw / c.totalDraws) * 100)}%`,
                      }} />
                    </View>
                  </View>
                </>
              )}

              <View style={{ alignItems: 'flex-end', marginTop: 8 }}>
                <Text style={{ fontSize: 11, color: C.navy, fontWeight: '600' }}>View details →</Text>
              </View>
            </Card>
          </TouchableOpacity>
        )}
      />

      {selected && memberId && (
        <ChitDetailModal chit={selected} memberId={memberId} onClose={() => setSelected(null)} />
      )}
    </SafeAreaView>
  );
}
