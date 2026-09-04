import { useState } from 'react';
import { View, Text, FlatList, RefreshControl, Modal, ScrollView, TouchableOpacity } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getMyMemberProfile, getPayoutsForMember, getMyChits } from '../../../services/api';
import { C, T, Card, Badge, Amount, EmptyState, LoadingScreen, ListLoadingScreen, Divider, fmtDate } from '../../../components/ui';
import { ProfileAvatarButton } from '../../../components/ProfileAvatarButton';

const PAYOUT_STATUS_COLOR: Record<string, string> = {
  PENDING:              C.amber,
  PARTIALLY_DISBURSED:  C.navyLight,
  DISBURSED:            C.green,
  CANCELLED:            C.red,
  VOIDED:               C.gray400,
  DISBURSEMENT_SETTLED: C.navy,
};

const PAYOUT_STATUS_LABEL: Record<string, string> = {
  PENDING:              'Awaiting Payout',
  PARTIALLY_DISBURSED:  'Partially Paid',
  DISBURSED:            'Fully Paid',
  CANCELLED:            'Cancelled',
  VOIDED:               'Voided',
  DISBURSEMENT_SETTLED: 'Settled',
};

const FILTER_CHIPS = [
  { key: 'ALL',                label: 'All' },
  { key: 'PENDING',            label: 'Pending' },
  { key: 'PARTIALLY_DISBURSED',label: 'Partial' },
  { key: 'DISBURSED',          label: 'Disbursed' },
  { key: 'CANCELLED',          label: 'Cancelled' },
];

export default function MemberPayoutsScreen() {
  const [detail, setDetail] = useState<any>(null);
  const [filter, setFilter] = useState('ALL');

  const { data: memberProfile, isLoading: profileLoading } = useQuery({
    queryKey: ['member-profile-me'],
    queryFn: getMyMemberProfile,
  });

  const memberId = memberProfile?.id;

  const { data: payouts = [], isLoading: payoutsLoading, refetch } = useQuery({
    queryKey: ['member-payouts', memberId],
    queryFn: () => getPayoutsForMember(memberId!),
    enabled: !!memberId,
  });

  const { data: chits = [] } = useQuery({
    queryKey: ['member-chits'],
    queryFn: getMyChits,
  });

  const chitMap: Record<string, string> = {};
  (chits as any[]).forEach((c: any) => { chitMap[c.id] = c.name; });

  const isLoading = profileLoading || payoutsLoading;
  if (isLoading) return <ListLoadingScreen />;

  const sorted = [...(payouts as any[])].sort((a, b) => {
    const order: Record<string, number> = { PENDING: 0, PARTIALLY_DISBURSED: 1, DISBURSED: 2, DISBURSEMENT_SETTLED: 3, CANCELLED: 4, VOIDED: 5 };
    return (order[a.status] ?? 9) - (order[b.status] ?? 9);
  });

  const counts: Record<string, number> = { ALL: sorted.length };
  FILTER_CHIPS.forEach((f) => {
    if (f.key !== 'ALL') counts[f.key] = sorted.filter((p) => p.status === f.key).length;
  });
  const visibleChips = FILTER_CHIPS.filter((f) => f.key === 'ALL' || counts[f.key] > 0);
  const visible = filter === 'ALL' ? sorted : sorted.filter((p) => p.status === filter);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.gray50 }}>
      <FlatList
        data={visible}
        keyExtractor={(p: any) => p.id}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={C.navy} />}
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        ListHeaderComponent={
          <View style={{ marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={T.h1}>My Payouts</Text>
              <ProfileAvatarButton size={34} />
            </View>
            <Text style={{ fontSize: 13, color: C.gray500, marginBottom: 14 }}>
              {sorted.length} payout{sorted.length !== 1 ? 's' : ''} total
            </Text>
            {/* Hero summary card */}
            {sorted.length > 0 && (() => {
              const activePayouts = sorted.filter((p) => p.status !== 'CANCELLED' && p.status !== 'VOIDED');
              const totalWon = activePayouts.reduce((s, p) => s + Number(p.netPayoutAmount ?? p.winningAmount ?? 0), 0);
              const totalDisbursed = sorted.reduce((s, p) => s + Number(p.disbursedAmount ?? 0), 0);
              return (
                <View style={{ backgroundColor: C.navy, borderRadius: 20, padding: 20, marginBottom: 14 }}>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.5)', letterSpacing: 1.2, marginBottom: 4 }}>TOTAL WON</Text>
                  <Text style={{ fontSize: 30, fontWeight: '800', color: '#D4A017', marginBottom: 12 }}>
                    ₹{totalWon.toLocaleString('en-IN')}
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 20 }}>
                    <View>
                      <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', marginBottom: 2 }}>Draws Won</Text>
                      <Text style={{ fontSize: 16, fontWeight: '700', color: C.white }}>{activePayouts.length}</Text>
                    </View>
                    {totalDisbursed > 0 && (
                      <View>
                        <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', marginBottom: 2 }}>Disbursed</Text>
                        <Text style={{ fontSize: 16, fontWeight: '700', color: C.green }}>₹{totalDisbursed.toLocaleString('en-IN')}</Text>
                      </View>
                    )}
                    {totalWon > totalDisbursed && (
                      <View>
                        <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', marginBottom: 2 }}>Pending</Text>
                        <Text style={{ fontSize: 16, fontWeight: '700', color: C.amber }}>₹{(totalWon - totalDisbursed).toLocaleString('en-IN')}</Text>
                      </View>
                    )}
                  </View>
                </View>
              );
            })()}
            {/* Filter chips */}
            {visibleChips.length > 1 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
                <View style={{ flexDirection: 'row', gap: 8, paddingBottom: 2 }}>
                  {visibleChips.map((chip) => {
                    const active = filter === chip.key;
                    return (
                      <TouchableOpacity
                        key={chip.key}
                        onPress={() => setFilter(chip.key)}
                        style={{
                          flexDirection: 'row', alignItems: 'center', gap: 5,
                          paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
                          backgroundColor: active ? C.navy : C.white,
                          borderWidth: 1.5, borderColor: active ? C.navy : C.gray300,
                        }}
                      >
                        <Text style={{ fontSize: 13, fontWeight: '600', color: active ? C.white : C.gray700 }}>
                          {chip.label}
                        </Text>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: active ? 'rgba(255,255,255,0.7)' : C.gray400 }}>
                          {counts[chip.key]}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>
            )}
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            title="No payouts yet"
            message="When you win a draw, your payout details will appear here."
          />
        }
        renderItem={({ item: p }) => {
          const statusColor = PAYOUT_STATUS_COLOR[p.status] ?? C.gray400;
          const chitName = chitMap[p.chitId] ?? '—';
          const netAmt = p.netPayoutAmount ?? p.winningAmount ?? p.payoutAmount ?? 0;
          const disbursed = p.disbursedAmount ?? 0;
          const remaining = p.remainingAmount ?? (netAmt - disbursed);

          return (
            <TouchableOpacity activeOpacity={0.85} onPress={() => setDetail(p)}>
              <Card style={{ marginBottom: 12, borderLeftWidth: 4, borderLeftColor: statusColor }}>
                {/* Header row */}
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: C.navy }} numberOfLines={1}>{chitName}</Text>
                    <Text style={{ fontSize: 12, color: C.gray500, marginTop: 2 }}>
                      Draw #{p.drawNumber ?? p.monthNumber ?? '—'}
                    </Text>
                  </View>
                  <View style={{
                    paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20,
                    backgroundColor: statusColor + '20',
                  }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: statusColor }}>
                      {PAYOUT_STATUS_LABEL[p.status] ?? p.status}
                    </Text>
                  </View>
                </View>

                <Divider />

                {/* Amounts */}
                <View style={{ flexDirection: 'row', gap: 20 }}>
                  <View>
                    <Text style={{ fontSize: 10, color: C.gray400, textTransform: 'uppercase', marginBottom: 2 }}>Won</Text>
                    <Amount value={netAmt} size="sm" color={C.green} />
                  </View>
                  {disbursed > 0 && (
                    <View>
                      <Text style={{ fontSize: 10, color: C.gray400, textTransform: 'uppercase', marginBottom: 2 }}>Received</Text>
                      <Amount value={disbursed} size="sm" color={C.navy} />
                    </View>
                  )}
                  {remaining > 0 && p.status !== 'DISBURSED' && p.status !== 'CANCELLED' && p.status !== 'VOIDED' && (
                    <View>
                      <Text style={{ fontSize: 10, color: C.amber, textTransform: 'uppercase', marginBottom: 2 }}>Pending</Text>
                      <Amount value={remaining} size="sm" color={C.amber} />
                    </View>
                  )}
                </View>

                {p.disbursedAt && (
                  <Text style={{ fontSize: 11, color: C.gray400, marginTop: 8 }}>
                    Paid {fmtDate(p.disbursedAt)}
                  </Text>
                )}
              </Card>
            </TouchableOpacity>
          );
        }}
      />

      {/* Detail modal */}
      <Modal visible={!!detail} animationType="slide" transparent presentationStyle="overFullScreen">
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <View style={{ backgroundColor: C.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: '65%' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <Text style={{ fontSize: 17, fontWeight: '700', color: C.navy }}>Payout Details</Text>
              <TouchableOpacity onPress={() => setDetail(null)}>
                <Text style={{ fontSize: 22, color: C.gray400 }}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {detail && (() => {
                const p = detail;
                const statusColor = PAYOUT_STATUS_COLOR[p.status] ?? C.gray400;
                const chitName = chitMap[p.chitId] ?? '—';
                const netAmt = p.netPayoutAmount ?? p.winningAmount ?? p.payoutAmount ?? 0;
                const disbursed = p.disbursedAmount ?? 0;
                const remaining = p.remainingAmount ?? (netAmt - disbursed);

                const Row = ({ label, value, color }: { label: string; value: string; color?: string }) => (
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.gray100 }}>
                    <Text style={{ fontSize: 13, color: C.gray500 }}>{label}</Text>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: color ?? C.gray900 }}>{value}</Text>
                  </View>
                );

                return (
                  <>
                    <Row label="Chit Fund" value={chitName} />
                    <Row label="Draw Number" value={`#${p.drawNumber ?? p.monthNumber ?? '—'}`} />
                    <Row label="Status" value={PAYOUT_STATUS_LABEL[p.status] ?? p.status} color={statusColor} />
                    <Row label="Won Amount" value={`₹${Number(netAmt).toLocaleString('en-IN')}`} color={C.green} />
                    {(p.winningAmount && p.netPayoutAmount && p.winningAmount !== p.netPayoutAmount) && (
                      <>
                        <Row label="Gross Won" value={`₹${Number(p.winningAmount).toLocaleString('en-IN')}`} />
                        <Row label="Withheld" value={`-₹${Number(p.winningAmount - p.netPayoutAmount).toLocaleString('en-IN')}`} color={C.red} />
                        <Row label="Net Payout" value={`₹${Number(p.netPayoutAmount).toLocaleString('en-IN')}`} color={C.green} />
                      </>
                    )}
                    {disbursed > 0 && <Row label="Received" value={`₹${Number(disbursed).toLocaleString('en-IN')}`} color={C.navy} />}
                    {remaining > 0 && p.status !== 'DISBURSED' && (
                      <Row label="Remaining" value={`₹${Number(remaining).toLocaleString('en-IN')}`} color={C.amber} />
                    )}
                    {p.disbursementMode && <Row label="Payment Mode" value={p.disbursementMode} />}
                    {p.disbursedAt && <Row label="Paid On" value={fmtDate(p.disbursedAt)} />}
                    {p.notes && <Row label="Notes" value={p.notes} />}
                  </>
                );
              })()}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
