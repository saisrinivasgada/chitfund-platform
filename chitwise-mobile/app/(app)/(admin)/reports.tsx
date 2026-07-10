import { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Share, Alert, RefreshControl, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { ProfileAvatarButton } from '../../../components/ProfileAvatarButton';
import {
  getMembers, getMember, getChitsForMember, getPayoutsForMember, getMemberTotalBalance,
  getAllPaymentBatches, getAllPayouts, getWalletBalance, getWalletTransactions, getChits,
  getPayoutById,
} from '../../../services/api';
import { C, T, Card, Badge, Amount, EmptyState, ListLoadingScreen, SectionHeader, fmtDate } from '../../../components/ui';

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = (n: any) => `₹${Number(n ?? 0).toLocaleString('en-IN')}`;
const todayStr = () => new Date().toISOString().slice(0, 10);
const monthStart = () => new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);

const PRESETS = [
  { label: 'Today',      from: todayStr,    to: todayStr },
  { label: 'This Month', from: monthStart,  to: todayStr },
  { label: 'All Time',   from: () => '',    to: () => ''  },
];

const PMT_STATUS_COLOR: Record<string, string> = {
  SETTLED: C.green, PAYOUT_DEDUCTED: C.green, SETTLEMENT_CLEARED: C.green,
  PARTIALLY_PAID: C.amber, OUTSTANDING: C.red, WAIVED: '#2563EB',
};
const PY_STATUS_COLOR: Record<string, string> = {
  DISBURSED: C.green, PENDING: C.amber, CANCELLED: C.red, VOIDED: C.gray400,
};

const REPORT_TYPES = ['Overview', 'Member', 'Payments', 'Payouts'] as const;
type ReportType = typeof REPORT_TYPES[number];

// ── Selector pill ─────────────────────────────────────────────────────────────
function Pill({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
        backgroundColor: active ? C.navy : C.white,
        borderWidth: 1, borderColor: active ? C.navy : C.gray200,
        marginRight: 8,
      }}
    >
      <Text style={{ fontSize: 13, fontWeight: '600', color: active ? C.white : C.gray500 }}>{label}</Text>
    </TouchableOpacity>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Payout Detail Modal
// ─────────────────────────────────────────────────────────────────────────────
function PayoutDetailModal({ payoutId, onClose }: { payoutId: string | null; onClose: () => void }) {
  const { data: p, isLoading } = useQuery({
    queryKey: ['payout-detail', payoutId],
    queryFn: () => getPayoutById(payoutId!),
    enabled: !!payoutId,
  });

  const STATUS_COLOR: Record<string, string> = {
    DISBURSED: C.green, PARTIALLY_DISBURSED: '#2563EB',
    PENDING: C.amber, CANCELLED: C.red, VOIDED: C.gray400,
  };

  function DeductionRow({ label, sub, amount, isTotal }: { label: string; sub?: string; amount: any; isTotal?: boolean }) {
    const n = Number(amount ?? 0);
    if (!isTotal && n === 0) return null;
    return (
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.gray100 }}>
        <View style={{ flex: 1, paddingRight: 8 }}>
          <Text style={{ fontSize: 13, fontWeight: isTotal ? '700' : '400', color: isTotal ? C.gray900 : C.gray600 }}>{label}</Text>
          {sub ? <Text style={{ fontSize: 11, color: C.gray400, marginTop: 2 }}>{sub}</Text> : null}
        </View>
        <Text style={{ fontSize: 13, fontWeight: isTotal ? '700' : '500', color: isTotal ? C.navy : C.red }}>
          {isTotal ? fmt(n) : `− ${fmt(n)}`}
        </Text>
      </View>
    );
  }

  return (
    <Modal visible={!!payoutId} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: C.gray50 }}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.gray100, backgroundColor: C.white }}>
          <TouchableOpacity onPress={onClose} style={{ marginRight: 12, padding: 4 }}>
            <Text style={{ fontSize: 22, color: C.gray500 }}>×</Text>
          </TouchableOpacity>
          <Text style={{ fontSize: 16, fontWeight: '700', color: C.gray900, flex: 1 }}>Payout Details</Text>
          {p && (
            <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: `${STATUS_COLOR[p.status] ?? C.gray400}20` }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: STATUS_COLOR[p.status] ?? C.gray400 }}>{p.status}</Text>
            </View>
          )}
        </View>

        {isLoading || !p ? (
          <ListLoadingScreen />
        ) : (
          <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>

            {/* Member + Chit */}
            <Card style={{ padding: 14 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                <Text style={T.xs}>Member</Text>
                <Text style={T.xs}>Chit · Draw</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: C.gray900 }}>{p.memberName ?? '—'}</Text>
                <Text style={{ fontSize: 14, fontWeight: '600', color: C.navy }}>{p.chitName ?? '—'} · #{p.monthNumber}</Text>
              </View>
              <Text style={[T.xs, { marginTop: 4 }]}>{fmtDate(p.createdAt)}</Text>
            </Card>

            {/* Breakdown */}
            <Card style={{ padding: 14 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: C.gray700, marginBottom: 6 }}>Payout Breakdown</Text>
              {/* Winning amount row */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.gray100 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: C.gray900 }}>Winning Amount</Text>
                <Text style={{ fontSize: 13, fontWeight: '700', color: C.gray900 }}>{fmt(p.winningAmount)}</Text>
              </View>
              {Number(p.installmentSettlement ?? 0) > 0 && (
                <DeductionRow label="Installment Withheld" sub={`Draw #${p.monthNumber} · ${p.chitName ?? ''}`} amount={p.installmentSettlement} />
              )}
              {Number(p.crossChitSettlement ?? 0) > 0 && (
                <DeductionRow label="Cross-Chit Settlement" sub="Outstanding dues from other chits" amount={p.crossChitSettlement} />
              )}
              {Number(p.manualAdjustment ?? 0) > 0 && (
                <DeductionRow label="Manual Adjustment" amount={p.manualAdjustment} />
              )}
              {Number(p.discountAmount ?? 0) > 0 && (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 }}>
                  <Text style={{ fontSize: 11, color: C.gray400 }}>Total Deductions</Text>
                  <Text style={{ fontSize: 11, fontWeight: '600', color: C.red }}>− {fmt(p.discountAmount)}</Text>
                </View>
              )}
              {/* Net payout */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, marginTop: 4, borderTopWidth: 2, borderTopColor: C.gray200 }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: C.gray900 }}>Net Payout</Text>
                <Text style={{ fontSize: 17, fontWeight: '800', color: C.navy }}>{fmt(p.netPayoutAmount)}</Text>
              </View>
            </Card>

            {/* Disbursements */}
            {(p.disbursements ?? []).length > 0 && (
              <Card style={{ padding: 14 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: C.gray700, marginBottom: 8 }}>
                  Disbursements · {fmt(p.disbursedAmount)} paid
                </Text>
                {(p.disbursements as any[]).map((d: any, i: number) => (
                  <View key={d.id ?? i} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderTopWidth: i > 0 ? 1 : 0, borderTopColor: C.gray100 }}>
                    <View>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: C.gray900 }}>{fmt(d.amount)}</Text>
                      <Text style={T.xs}>{d.mode}{d.referenceNumber ? ` · ${d.referenceNumber}` : ''}</Text>
                      {d.notes ? <Text style={[T.xs, { fontStyle: 'italic' }]}>{d.notes}</Text> : null}
                    </View>
                    <Text style={T.xs}>{fmtDate(d.disbursedAt)}</Text>
                  </View>
                ))}
                {Number(p.remainingAmount ?? 0) > 0 && (
                  <Text style={[T.xs, { color: C.amber, marginTop: 6 }]}>₹{Number(p.remainingAmount).toLocaleString('en-IN')} remaining</Text>
                )}
              </Card>
            )}

            {/* Notes */}
            {p.notes && (
              <Card style={{ padding: 14, backgroundColor: '#FFFBEB', borderColor: '#FDE68A', borderWidth: 1 }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: '#92400E', marginBottom: 2 }}>Notes</Text>
                <Text style={{ fontSize: 13, color: '#78350F' }}>{p.notes}</Text>
              </Card>
            )}

            {/* Cancellation */}
            {(p.cancellationReason || p.voidReason) && (
              <Card style={{ padding: 14, backgroundColor: '#FEF2F2', borderColor: '#FECACA', borderWidth: 1 }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: C.red, marginBottom: 2 }}>
                  {p.cancellationReason ? 'Cancellation Reason' : 'Void Reason'}
                </Text>
                <Text style={{ fontSize: 13, color: '#991B1B' }}>{p.cancellationReason ?? p.voidReason}</Text>
              </Card>
            )}

          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Overview Report
// ─────────────────────────────────────────────────────────────────────────────
function OverviewReport() {
  const { data: wallet } = useQuery({ queryKey: ['rpt-wallet'], queryFn: getWalletBalance });
  const { data: allPayouts = [] } = useQuery({ queryKey: ['rpt-all-payouts'], queryFn: () => getAllPayouts() });
  const { data: members = [] } = useQuery({ queryKey: ['rpt-members'], queryFn: getMembers });
  const { data: chits = [] } = useQuery({ queryKey: ['rpt-chits'], queryFn: getChits });

  const totalDisbursed = (allPayouts as any[]).filter(p => p.status === 'DISBURSED')
    .reduce((s: number, p: any) => s + (p.netDisbursed ?? p.disbursedAmount ?? 0), 0);
  const pendingPayouts = (allPayouts as any[]).filter(p => p.status === 'PENDING').length;
  const activeChits = (chits as any[]).filter(c => c.status === 'ACTIVE').length;
  const activeMembers = (members as any[]).filter(m => m.status === 'ACTIVE').length;

  const stats = [
    { label: 'Cash Balance',   value: fmt((wallet as any)?.cashBalance), accent: C.green },
    { label: 'Bank Balance',   value: fmt((wallet as any)?.bankBalance), accent: C.navy },
    { label: 'Total Disbursed', value: fmt(totalDisbursed),               accent: C.amber },
    { label: 'Pending Payouts', value: String(pendingPayouts),            accent: C.red },
    { label: 'Active Chits',    value: String(activeChits),               accent: C.navy },
    { label: 'Active Members',  value: String(activeMembers),             accent: C.green },
  ];

  const handleShare = async () => {
    const lines = [
      '📊 ChitWise Overview Report',
      `Generated: ${new Date().toLocaleString('en-IN')}`,
      '',
      ...stats.map(s => `${s.label}: ${s.value}`),
    ];
    await Share.share({ message: lines.join('\n') });
  };

  return (
    <View>
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 12 }}>
        <TouchableOpacity
          onPress={handleShare}
          style={{ backgroundColor: C.navy, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, flexDirection: 'row', alignItems: 'center', gap: 6 }}
        >
          <Text style={{ color: C.white, fontSize: 13, fontWeight: '600' }}>⬆ Share</Text>
        </TouchableOpacity>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {stats.map(s => (
          <Card key={s.label} style={{ width: '47%', padding: 14 }}>
            <Text style={[T.xs, { marginBottom: 4 }]}>{s.label}</Text>
            <Text style={{ fontSize: 18, fontWeight: '700', color: s.accent }}>{s.value}</Text>
          </Card>
        ))}
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Member Report
// ─────────────────────────────────────────────────────────────────────────────
function MemberReport() {
  const [memberId, setMemberId] = useState<string>('');
  const [search, setSearch] = useState('');
  const [showPicker, setShowPicker] = useState(false);
  const [selectedPayoutId, setSelectedPayoutId] = useState<string | null>(null);

  const { data: allMembers = [] } = useQuery({ queryKey: ['rpt-members'], queryFn: getMembers });
  const { data: member } = useQuery({ queryKey: ['rpt-member', memberId], queryFn: () => getMember(memberId), enabled: !!memberId });
  const { data: chits = [], isLoading: loadingChits } = useQuery({ queryKey: ['rpt-member-chits', memberId], queryFn: () => getChitsForMember(memberId), enabled: !!memberId });
  const { data: payouts = [] } = useQuery({ queryKey: ['rpt-member-payouts', memberId], queryFn: () => getPayoutsForMember(memberId), enabled: !!memberId });
  const { data: balance } = useQuery({ queryKey: ['rpt-member-balance', memberId], queryFn: () => getMemberTotalBalance(memberId), enabled: !!memberId });

  const filtered = (allMembers as any[]).filter((m: any) =>
    m.name?.toLowerCase().includes(search.toLowerCase()) || m.phone?.includes(search)
  );

  const selectedMember = (allMembers as any[]).find((m: any) => m.id === memberId);

  const totalPaid = (chits as any[]).reduce((s: number, c: any) => s + (c.paidAmount ?? 0), 0);
  const totalReceived = (payouts as any[]).filter((p: any) => p.status === 'DISBURSED')
    .reduce((s: number, p: any) => s + (p.netDisbursed ?? p.disbursedAmount ?? 0), 0);

  const handleShare = async () => {
    if (!member) return;
    const lines = [
      `👤 Member Report: ${(member as any).name}`,
      `Phone: ${(member as any).phone ?? '—'} | Status: ${(member as any).status}`,
      `Generated: ${new Date().toLocaleString('en-IN')}`,
      '',
      `Outstanding Balance: ${fmt((balance as any)?.totalBalance)}`,
      `Total Installments Paid: ${fmt(totalPaid)}`,
      `Total Payouts Received: ${fmt(totalReceived)}`,
      '',
      '--- Chit Enrollments ---',
      ...(chits as any[]).map((c: any) =>
        `• ${c.name ?? c.chitName}: Draw #${c.currentDraw ?? '—'} of ${c.totalMonths} | Paid: ${fmt(c.paidAmount)}`
      ),
      '',
      '--- Payouts ---',
      ...(payouts as any[]).map((p: any) =>
        `• ${p.chitName ?? '—'} Draw #${p.drawNumber}: ${fmt(p.netDisbursed ?? p.disbursedAmount)} [${p.status}]`
      ),
    ];
    await Share.share({ message: lines.join('\n') });
  };

  return (
    <View>
      {/* Member Selector */}
      <TouchableOpacity
        onPress={() => setShowPicker(true)}
        style={{ backgroundColor: C.white, borderWidth: 1, borderColor: C.gray200, borderRadius: 12, padding: 14, marginBottom: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
      >
        <Text style={{ color: selectedMember ? C.gray900 : C.gray400, fontSize: 15 }}>
          {selectedMember ? (selectedMember as any).name : 'Select a member…'}
        </Text>
        <Text style={{ color: C.gray400 }}>▼</Text>
      </TouchableOpacity>

      {/* Member picker modal */}
      {showPicker && (
        <View style={{ backgroundColor: C.white, borderRadius: 16, borderWidth: 1, borderColor: C.gray200, marginBottom: 16, maxHeight: 320 }}>
          <View style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: C.gray100 }}>
            <View style={{ backgroundColor: C.gray50, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 }}>
              <Text style={{ color: C.gray400, fontSize: 13, marginBottom: 4 }}>Search</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ color: C.gray400, marginRight: 6 }}>🔍</Text>
                {/* eslint-disable-next-line react-native/no-inline-styles */}
                <View style={{ flex: 1 }}>
                  <Text
                    onPress={() => {}}
                    style={{ color: search ? C.gray900 : C.gray400, fontSize: 15 }}
                  />
                </View>
              </View>
            </View>
          </View>
          <ScrollView style={{ maxHeight: 240 }}>
            {filtered.slice(0, 40).map((m: any) => (
              <TouchableOpacity
                key={m.id}
                onPress={() => { setMemberId(m.id); setShowPicker(false); setSearch(''); }}
                style={{ paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.gray50, backgroundColor: m.id === memberId ? C.navy50 : C.white }}
              >
                <Text style={{ fontSize: 15, color: C.gray900, fontWeight: '500' }}>{m.name}</Text>
                <Text style={T.xs}>{m.phone} · {m.status}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {!memberId && (
        <EmptyState title="Select a member" message="Choose a member above to generate their report." />
      )}

      {memberId && loadingChits && <ListLoadingScreen />}

      {memberId && !loadingChits && (
        <View>
          {/* Share button */}
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 12 }}>
            <TouchableOpacity
              onPress={handleShare}
              style={{ backgroundColor: C.navy, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 }}
            >
              <Text style={{ color: C.white, fontSize: 13, fontWeight: '600' }}>⬆ Share</Text>
            </TouchableOpacity>
          </View>

          {/* Summary */}
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
            <Card style={{ flex: 1, padding: 14 }}>
              <Text style={T.xs}>Outstanding</Text>
              <Text style={{ fontSize: 16, fontWeight: '700', color: C.red, marginTop: 4 }}>{fmt((balance as any)?.totalBalance)}</Text>
            </Card>
            <Card style={{ flex: 1, padding: 14 }}>
              <Text style={T.xs}>Total Paid</Text>
              <Text style={{ fontSize: 16, fontWeight: '700', color: C.green, marginTop: 4 }}>{fmt(totalPaid)}</Text>
            </Card>
            <Card style={{ flex: 1, padding: 14 }}>
              <Text style={T.xs}>Received</Text>
              <Text style={{ fontSize: 16, fontWeight: '700', color: C.navy, marginTop: 4 }}>{fmt(totalReceived)}</Text>
            </Card>
          </View>

          {/* Chit enrollments */}
          <SectionHeader title="Chit Enrollments" />
          {(chits as any[]).length === 0 ? (
            <Text style={[T.sm, { textAlign: 'center', paddingVertical: 12 }]}>No chit enrollments</Text>
          ) : (chits as any[]).map((c: any) => (
            <Card key={c.id ?? c.chitId} style={{ marginBottom: 8, padding: 14 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={[T.h3, { flex: 1 }]} numberOfLines={1}>{c.name ?? c.chitName}</Text>
                <Badge status={c.status ?? 'ACTIVE'} />
              </View>
              <View style={{ flexDirection: 'row', gap: 16, marginTop: 8 }}>
                <Text style={T.sm}>Draw #{c.currentDraw ?? '—'} / {c.totalMonths}</Text>
                <Text style={T.sm}>Paid: {fmt(c.paidAmount)}</Text>
              </View>
            </Card>
          ))}

          {/* Payouts */}
          <SectionHeader title="Payouts" />
          {(payouts as any[]).length === 0 ? (
            <Text style={[T.sm, { textAlign: 'center', paddingVertical: 12 }]}>No payouts</Text>
          ) : (payouts as any[]).map((p: any) => (
            <TouchableOpacity key={p.id} onPress={() => setSelectedPayoutId(p.id)} activeOpacity={0.7}>
              <Card style={{ marginBottom: 8, padding: 14 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={T.h3} numberOfLines={1}>{p.chitName ?? '—'} · Draw #{p.drawNumber ?? p.monthNumber}</Text>
                    <Text style={T.xs}>{fmtDate(p.disbursedAt ?? p.createdAt)}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: PY_STATUS_COLOR[p.status] ?? C.gray700 }}>{fmt(p.netDisbursed ?? p.netPayoutAmount ?? p.disbursedAmount)}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Text style={T.xs}>{p.status}</Text>
                      {(Number(p.crossChitSettlement ?? 0) > 0 || Number(p.manualAdjustment ?? 0) !== 0 || Number(p.installmentSettlement ?? 0) > 0) && (
                        <View style={{ backgroundColor: '#EEF2FF', borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1 }}>
                          <Text style={{ fontSize: 9, fontWeight: '700', color: '#4338CA' }}>+ADJ</Text>
                        </View>
                      )}
                    </View>
                  </View>
                </View>
              </Card>
            </TouchableOpacity>
          ))}
        </View>
      )}
      <PayoutDetailModal payoutId={selectedPayoutId} onClose={() => setSelectedPayoutId(null)} />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Payments Report
// ─────────────────────────────────────────────────────────────────────────────
function PaymentsReport() {
  const [presetIdx, setPresetIdx] = useState(2);
  const from = PRESETS[presetIdx].from();
  const to   = PRESETS[presetIdx].to();

  const { data: batches = [], isLoading, refetch } = useQuery({
    queryKey: ['rpt-payment-batches', from, to],
    queryFn: () => getAllPaymentBatches({ fromDate: from || undefined, toDate: to || undefined, size: 500 }),
  });

  const total = (batches as any[]).reduce((s: number, b: any) => s + (b.totalAmount ?? 0), 0);

  const handleShare = async () => {
    const lines = [
      `💰 Payments Report`,
      `Period: ${PRESETS[presetIdx].label}`,
      `Generated: ${new Date().toLocaleString('en-IN')}`,
      '',
      `Total Records: ${(batches as any[]).length}`,
      `Total Amount: ${fmt(total)}`,
      '',
      ...(batches as any[]).slice(0, 50).map((b: any) =>
        `• ${fmtDate(b.collectedAt ?? b.createdAt)} | ${b.memberName ?? '—'} | ${b.chitName ?? '—'} | ${fmt(b.totalAmount)} [${b.status}]`
      ),
    ];
    await Share.share({ message: lines.join('\n') });
  };

  return (
    <View>
      {/* Period selector */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
        <View style={{ flexDirection: 'row' }}>
          {PRESETS.map((p, i) => (
            <Pill key={p.label} label={p.label} active={i === presetIdx} onPress={() => setPresetIdx(i)} />
          ))}
        </View>
      </ScrollView>

      {/* Summary + share */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <Card style={{ flex: 1, padding: 14 }}>
          <Text style={T.xs}>Records</Text>
          <Text style={{ fontSize: 20, fontWeight: '700', color: C.navy, marginTop: 4 }}>{(batches as any[]).length}</Text>
        </Card>
        <Card style={{ flex: 1, padding: 14 }}>
          <Text style={T.xs}>Total Amount</Text>
          <Text style={{ fontSize: 18, fontWeight: '700', color: C.green, marginTop: 4 }}>{fmt(total)}</Text>
        </Card>
        <TouchableOpacity
          onPress={handleShare}
          style={{ backgroundColor: C.navy, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20 }}
        >
          <Text style={{ color: C.white, fontSize: 13, fontWeight: '600' }}>⬆ Share</Text>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <ListLoadingScreen />
      ) : (batches as any[]).length === 0 ? (
        <EmptyState title="No payments" message="No payment records found for the selected period." />
      ) : (
        <View>
          {(batches as any[]).map((b: any) => (
            <Card key={b.id} style={{ marginBottom: 8, padding: 12 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: C.gray900 }} numberOfLines={1}>
                    {b.memberName ?? '—'}
                  </Text>
                  <Text style={T.xs} numberOfLines={1}>{b.chitName ?? '—'} · {fmtDate(b.collectedAt ?? b.createdAt)}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: PMT_STATUS_COLOR[b.status] ?? C.gray700 }}>{fmt(b.totalAmount)}</Text>
                  <Text style={T.xs}>{b.status}</Text>
                </View>
              </View>
            </Card>
          ))}
        </View>
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Payouts Report
// ─────────────────────────────────────────────────────────────────────────────
function PayoutsReport() {
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [selectedPayoutId, setSelectedPayoutId] = useState<string | null>(null);

  const { data: payouts = [], isLoading } = useQuery({
    queryKey: ['rpt-all-payouts'],
    queryFn: () => getAllPayouts(),
  });

  const STATUS_FILTERS = ['ALL', 'DISBURSED', 'PENDING', 'CANCELLED'];
  const filtered = statusFilter === 'ALL'
    ? (payouts as any[])
    : (payouts as any[]).filter((p: any) => p.status === statusFilter);

  const totalDisbursed = (payouts as any[]).filter((p: any) => p.status === 'DISBURSED')
    .reduce((s: number, p: any) => s + (p.netDisbursed ?? p.disbursedAmount ?? 0), 0);
  const pending = (payouts as any[]).filter((p: any) => p.status === 'PENDING').length;

  const handleShare = async () => {
    const lines = [
      '📤 Payouts Report',
      `Generated: ${new Date().toLocaleString('en-IN')}`,
      '',
      `Total Disbursed: ${fmt(totalDisbursed)}`,
      `Pending Payouts: ${pending}`,
      '',
      ...filtered.slice(0, 50).map((p: any) =>
        `• ${p.memberName ?? '—'} | ${p.chitName ?? '—'} Draw #${p.drawNumber} | ${fmt(p.netDisbursed ?? p.disbursedAmount)} [${p.status}]`
      ),
    ];
    await Share.share({ message: lines.join('\n') });
  };

  return (
    <View>
      {/* Status filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
        <View style={{ flexDirection: 'row' }}>
          {STATUS_FILTERS.map(s => (
            <Pill key={s} label={s} active={statusFilter === s} onPress={() => setStatusFilter(s)} />
          ))}
        </View>
      </ScrollView>

      {/* Summary + share */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <Card style={{ flex: 1, padding: 14 }}>
          <Text style={T.xs}>Total Disbursed</Text>
          <Text style={{ fontSize: 16, fontWeight: '700', color: C.green, marginTop: 4 }}>{fmt(totalDisbursed)}</Text>
        </Card>
        <Card style={{ flex: 1, padding: 14 }}>
          <Text style={T.xs}>Pending</Text>
          <Text style={{ fontSize: 20, fontWeight: '700', color: C.amber, marginTop: 4 }}>{pending}</Text>
        </Card>
        <TouchableOpacity
          onPress={handleShare}
          style={{ backgroundColor: C.navy, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20 }}
        >
          <Text style={{ color: C.white, fontSize: 13, fontWeight: '600' }}>⬆ Share</Text>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <ListLoadingScreen />
      ) : filtered.length === 0 ? (
        <EmptyState title="No payouts" message="No payout records found." />
      ) : (
        <View>
          {filtered.map((p: any) => (
            <TouchableOpacity key={p.id} onPress={() => setSelectedPayoutId(p.id)} activeOpacity={0.7}>
              <Card style={{ marginBottom: 8, padding: 12 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: C.gray900 }} numberOfLines={1}>{p.memberName ?? '—'}</Text>
                    <Text style={T.xs} numberOfLines={1}>{p.chitName ?? '—'} · Draw #{p.drawNumber ?? p.monthNumber} · {fmtDate(p.disbursedAt ?? p.createdAt)}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: PY_STATUS_COLOR[p.status] ?? C.gray700 }}>{fmt(p.netDisbursed ?? p.netPayoutAmount ?? p.disbursedAmount)}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      {p.discountAmount > 0 && <Text style={T.xs}>-{fmt(p.discountAmount)} withheld</Text>}
                      {(Number(p.crossChitSettlement ?? 0) > 0 || Number(p.manualAdjustment ?? 0) !== 0 || Number(p.installmentSettlement ?? 0) > 0) && (
                        <View style={{ backgroundColor: '#EEF2FF', borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1 }}>
                          <Text style={{ fontSize: 9, fontWeight: '700', color: '#4338CA' }}>+ADJ</Text>
                        </View>
                      )}
                    </View>
                  </View>
                </View>
              </Card>
            </TouchableOpacity>
          ))}
        </View>
      )}
      <PayoutDetailModal payoutId={selectedPayoutId} onClose={() => setSelectedPayoutId(null)} />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Screen
// ─────────────────────────────────────────────────────────────────────────────
export default function ReportsScreen() {
  const [activeReport, setActiveReport] = useState<ReportType>('Overview');

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.gray50 }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {/* Header */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <View>
            <Text style={T.h1}>Reports</Text>
            <Text style={T.sm}>Generate and share reports</Text>
          </View>
          <ProfileAvatarButton />
        </View>

        {/* Report type selector */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }}>
          <View style={{ flexDirection: 'row' }}>
            {REPORT_TYPES.map(r => (
              <Pill key={r} label={r} active={activeReport === r} onPress={() => setActiveReport(r)} />
            ))}
          </View>
        </ScrollView>

        {/* Report content */}
        {activeReport === 'Overview'  && <OverviewReport />}
        {activeReport === 'Member'    && <MemberReport />}
        {activeReport === 'Payments'  && <PaymentsReport />}
        {activeReport === 'Payouts'   && <PayoutsReport />}
      </ScrollView>
    </SafeAreaView>
  );
}
