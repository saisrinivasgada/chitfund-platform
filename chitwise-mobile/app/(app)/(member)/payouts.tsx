import { useState } from 'react';
import { View, Text, FlatList, RefreshControl, Modal, ScrollView, TouchableOpacity } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getMyMemberProfile, getPayoutsForMember, getMyChits, getPayoutById } from '../../../services/api';
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

const MODE_EMOJI: Record<string, string> = {
  CASH: '💵', UPI: '📱', BANK: '🏦', NEFT: '🏦', RTGS: '🏦', IMPS: '🏦', BANK_TRANSFER: '🏦',
};

function BreakdownRow({ label, sub, value, color, bold, tinted }: {
  label: string; sub?: string; value: string; color?: string; bold?: boolean; tinted?: string;
}) {
  return (
    <View style={{
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
      paddingVertical: 11, paddingHorizontal: tinted ? 12 : 0,
      marginHorizontal: tinted ? -12 : 0,
      backgroundColor: tinted ?? 'transparent',
      borderBottomWidth: 1, borderBottomColor: C.gray100,
    }}>
      <View style={{ flex: 1, paddingRight: 12 }}>
        <Text style={{ fontSize: 13, fontWeight: bold ? '700' : '500', color: bold ? C.gray900 : C.gray600 ?? C.gray500 }}>
          {label}
        </Text>
        {sub ? <Text style={{ fontSize: 11, color: C.gray400, marginTop: 2 }}>{sub}</Text> : null}
      </View>
      <Text style={{ fontSize: bold ? 15 : 13, fontWeight: bold ? '800' : '600', color: color ?? C.gray900 }}>
        {value}
      </Text>
    </View>
  );
}

/**
 * The list endpoint returns a payout summary without `disbursements`, so the
 * modal refetches the full record by id and seeds it with the summary so the
 * numbers render immediately instead of flashing empty.
 */
function PayoutDetailModal({ summary, chitName, onClose }: {
  summary: any; chitName: string; onClose: () => void;
}) {
  const { data: full } = useQuery({
    queryKey: ['member-payout', summary?.id],
    queryFn: () => getPayoutById(summary.id),
    enabled: !!summary?.id,
    initialData: summary,
  });

  const p = full ?? summary;
  const inr = (v: any) => `₹${Number(v ?? 0).toLocaleString('en-IN')}`;
  const statusColor = PAYOUT_STATUS_COLOR[p.status] ?? C.gray400;
  const disbursements: any[] = p.disbursements ?? [];
  const isDisbursed = p.status === 'DISBURSED' || p.status === 'PARTIALLY_DISBURSED';
  const remaining = Number(p.remainingAmount ?? 0);

  return (
    <Modal visible animationType="slide" transparent presentationStyle="overFullScreen" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}>
        <View style={{ backgroundColor: C.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: '85%' }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 17, fontWeight: '700', color: C.navy }}>
                Payout — Draw #{p.drawNumber ?? p.monthNumber ?? '—'}
              </Text>
              <Text style={{ fontSize: 12, color: C.gray500, marginTop: 2 }}>{chitName}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ backgroundColor: statusColor + '20', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: statusColor }}>
                  {PAYOUT_STATUS_LABEL[p.status] ?? p.status}
                </Text>
              </View>
              <TouchableOpacity onPress={onClose}>
                <Text style={{ fontSize: 22, color: C.gray400 }}>✕</Text>
              </TouchableOpacity>
            </View>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Breakdown */}
            <Text style={{ fontSize: 11, fontWeight: '700', color: C.gray400, letterSpacing: 0.8, marginBottom: 4 }}>
              PAYOUT BREAKDOWN
            </Text>
            <BreakdownRow label="Winning Amount" value={inr(p.winningAmount)} bold />
            {Number(p.installmentSettlement ?? 0) > 0 && (
              <BreakdownRow
                label="Installment Withheld"
                sub={`Draw #${p.drawNumber ?? p.monthNumber} installment`}
                value={`− ${inr(p.installmentSettlement)}`}
                color={C.red}
              />
            )}
            {Number(p.crossChitSettlement ?? 0) > 0 && (
              <BreakdownRow
                label="Cross-Chit Settlement"
                sub="Outstanding dues from your other chits"
                value={`− ${inr(p.crossChitSettlement)}`}
                color={C.red}
              />
            )}
            {Number(p.manualAdjustment ?? 0) > 0 && (
              <BreakdownRow label="Manual Adjustment" value={`− ${inr(p.manualAdjustment)}`} color={C.red} />
            )}
            {Number(p.discountAmount ?? 0) > 0 && (
              <BreakdownRow label="Total Withheld" value={`− ${inr(p.discountAmount)}`} color={C.red} bold tinted="#FEF2F2" />
            )}
            <BreakdownRow label="Net Payout" value={inr(p.netPayoutAmount)} color={C.navy} bold tinted={C.gray50} />

            {/* Disbursements */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 22, marginBottom: 8 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: C.gray400, letterSpacing: 0.8 }}>
                DISBURSEMENTS
              </Text>
              <Text style={{ fontSize: 11, color: C.gray400 }}>
                Paid <Text style={{ fontWeight: '700', color: C.green }}>{inr(p.disbursedAmount)}</Text>
                {remaining > 0 ? <Text style={{ color: C.amber }}>{`  ·  ${inr(remaining)} pending`}</Text> : null}
              </Text>
            </View>

            {disbursements.length === 0 ? (
              <Text style={{ fontSize: 13, color: C.gray400, textAlign: 'center', paddingVertical: 18 }}>
                {isDisbursed ? 'No disbursement records' : 'Not yet disbursed'}
              </Text>
            ) : (
              disbursements.map((d: any, i: number) => (
                <View
                  key={d.id ?? i}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 12,
                    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.gray100,
                  }}
                >
                  <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: '#F0FDF4', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 16 }}>{MODE_EMOJI[d.mode] ?? '💵'}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: C.gray900 }}>{inr(d.amount)}</Text>
                    <Text style={{ fontSize: 11, color: C.gray400, marginTop: 1 }}>
                      {d.mode}{d.referenceNumber ? ` · ${d.referenceNumber}` : ''}
                    </Text>
                    {d.notes ? (
                      <Text style={{ fontSize: 11, color: C.gray500, fontStyle: 'italic', marginTop: 1 }}>{d.notes}</Text>
                    ) : null}
                  </View>
                  <Text style={{ fontSize: 11, color: C.gray400 }}>{fmtDate(d.disbursedAt)}</Text>
                </View>
              ))
            )}

            {p.notes ? (
              <View style={{ backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A', borderRadius: 12, padding: 14, marginTop: 18 }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: '#B45309', letterSpacing: 0.5, marginBottom: 5 }}>NOTES</Text>
                <Text style={{ fontSize: 13, color: '#92400E' }}>{p.notes}</Text>
              </View>
            ) : null}
            <View style={{ height: 16 }} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

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
      {detail && (
        <PayoutDetailModal
          summary={detail}
          chitName={chitMap[detail.chitId] ?? '—'}
          onClose={() => setDetail(null)}
        />
      )}
    </SafeAreaView>
  );
}
