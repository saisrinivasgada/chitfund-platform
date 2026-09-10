import { useState, useMemo } from 'react';
import { View, Text, FlatList, RefreshControl, TouchableOpacity, Modal, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { getMyPaymentBatches, getPaymentBatchById, getChit, getDraws } from '../../../services/api';
import { C, T, Card, Badge, Amount, EmptyState, ListLoadingScreen, fmtDate } from '../../../components/ui';
import { ProfileAvatarButton } from '../../../components/ProfileAvatarButton';

const DATE_FILTERS = [
  { key: 'today', label: 'Today' },
  { key: '7d',    label: '7 Days' },
  { key: '30d',   label: '30 Days' },
  { key: 'all',   label: 'All Time' },
] as const;

const MODE_FILTERS = ['ALL', 'CASH', 'UPI', 'BANK_TRANSFER'] as const;

const MODE_BADGE: Record<string, { bg: string; text: string; label: string }> = {
  CASH:          { bg: C.green,      text: '#fff',    label: 'Cash' },
  UPI:           { bg: C.gold,       text: '#fff',    label: 'UPI' },
  BANK_TRANSFER: { bg: C.navy,       text: '#fff',    label: 'Bank' },
};

function isToday(d: Date | null) {
  if (!d) return false;
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

function parseTs(s: any): Date | null {
  if (!s) return null;
  const str = typeof s === 'string' && !s.endsWith('Z') && !s.includes('+') ? s + 'Z' : s;
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

const BATCH_STATUS: Record<string, { label: string; bg: string; text: string }> = {
  COMPLETED:           { label: 'Paid',       bg: '#DCFCE7', text: '#15803D' },
  AWAITING_REMITTANCE: { label: 'Processing', bg: '#FEF3C7', text: '#B45309' },
  VOIDED:              { label: 'Voided',     bg: '#FEE2E2', text: '#DC2626' },
};

/** Draw numbers this batch was allocated against, e.g. "Draw #3, #4". */
function drawLabel(b: any): string | null {
  const nums = (b.allocations ?? [])
    .map((a: any) => a.monthNumber)
    .filter((n: any) => n != null)
    .sort((x: number, y: number) => x - y);
  if (nums.length === 0) return null;
  return `Draw ${nums.map((n: number) => `#${n}`).join(', ')}`;
}

function PaymentReceiptModal({ batchId, onClose }: { batchId: string; onClose: () => void }) {
  const { data: batch, isLoading } = useQuery({
    queryKey: ['batch', batchId],
    queryFn: () => getPaymentBatchById(batchId),
    enabled: !!batchId,
  });
  const { data: chit } = useQuery({
    queryKey: ['chit', batch?.chitId],
    queryFn: () => getChit(batch.chitId),
    enabled: !!batch?.chitId,
  });
  const { data: draws = [] } = useQuery({
    queryKey: ['draws', batch?.chitId],
    queryFn: () => getDraws(batch.chitId),
    enabled: !!batch?.chitId,
  });

  const status = batch ? (BATCH_STATUS[batch.status] ?? { label: batch.status, bg: C.gray100, text: C.gray700 }) : null;

  const rows = batch ? ([
    chit?.name && { label: 'Chit Fund', value: chit.name },
    batch.allocations?.length > 0 && {
      label: 'Draw(s)',
      value: (() => {
        const byMonth = Object.fromEntries((draws as any[]).map((d: any) => [d.monthNumber, d]));
        return batch.allocations
          .map((a: any) => {
            const dd = byMonth[a.monthNumber]?.drawDate ? new Date(byMonth[a.monthNumber].drawDate) : null;
            const month = dd ? dd.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) : null;
            return month ? `Draw #${a.monthNumber} · ${month}` : `Draw #${a.monthNumber}`;
          })
          .join('\n');
      })(),
    },
    batch.paymentMode && { label: 'Mode', value: String(batch.paymentMode).replace(/_/g, ' ') },
    batch.collectorName && { label: 'Collected by', value: batch.collectorName },
    batch.referenceNumber && { label: 'Reference', value: batch.referenceNumber },
    (batch.remittedAt || batch.collectedAt || batch.createdAt) && {
      label: 'Date',
      value: fmtDate(batch.remittedAt ?? batch.collectedAt ?? batch.createdAt),
    },
    batch.notes && { label: 'Notes', value: batch.notes },
  ].filter(Boolean) as { label: string; value: string }[]) : [];

  return (
    <Modal visible animationType="slide" transparent presentationStyle="overFullScreen" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}>
        <View style={{ backgroundColor: C.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: '80%' }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <Text style={{ fontSize: 17, fontWeight: '700', color: C.navy }}>Payment Receipt</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={{ fontSize: 22, color: C.gray400 }}>✕</Text>
            </TouchableOpacity>
          </View>

          {isLoading ? (
            <Text style={{ textAlign: 'center', color: C.gray400, padding: 20 }}>Loading…</Text>
          ) : !batch ? (
            <Text style={{ textAlign: 'center', color: C.gray400, padding: 20 }}>Receipt not available</Text>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={{ backgroundColor: '#F0F4FA', borderRadius: 14, padding: 16, marginBottom: 16, alignItems: 'center' }}>
                <Text style={{ fontSize: 11, color: C.gray500, fontWeight: '600', letterSpacing: 0.8, marginBottom: 4 }}>
                  AMOUNT PAID
                </Text>
                <Text style={{ fontSize: 32, fontWeight: '800', color: C.navy }}>
                  ₹{Number(batch.totalAmount ?? 0).toLocaleString('en-IN')}
                </Text>
                {status && (
                  <View style={{ marginTop: 8, backgroundColor: status.bg, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20 }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: status.text }}>{status.label}</Text>
                  </View>
                )}
              </View>

              {rows.map((row) => (
                <View
                  key={row.label}
                  style={{
                    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
                    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.gray100,
                  }}
                >
                  <Text style={{ fontSize: 13, color: C.gray500, fontWeight: '500' }}>{row.label}</Text>
                  <Text style={{ fontSize: 13, color: C.gray900, fontWeight: '600', textAlign: 'right', flex: 1, marginLeft: 16 }}>
                    {row.value}
                  </Text>
                </View>
              ))}
              <View style={{ height: 16 }} />
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

export default function MemberPaymentsScreen() {
  const [dateFilter, setDateFilter] = useState<'today' | '7d' | '30d' | 'all'>('all');
  const [modeFilter, setModeFilter] = useState<string>('ALL');
  const [receiptId, setReceiptId] = useState<string | null>(null);

  const { data: batches = [], isLoading, refetch } = useQuery({
    queryKey: ['my-payment-batches'],
    queryFn: getMyPaymentBatches,
    refetchOnMount: 'always',
    refetchInterval: 30_000,
  });

  const filtered = useMemo(() => {
    const now = Date.now();
    return (batches as any[]).filter((b: any) => {
      const dt = parseTs(b.collectedAt ?? b.createdAt);
      const ts = dt?.getTime() ?? 0;
      if (dateFilter === 'today' && !isToday(dt)) return false;
      if (dateFilter === '7d'   && ts < now - 7  * 86_400_000) return false;
      if (dateFilter === '30d'  && ts < now - 30 * 86_400_000) return false;
      if (modeFilter !== 'ALL' && b.paymentMode !== modeFilter) return false;
      return true;
    });
  }, [batches, dateFilter, modeFilter]);

  const total = filtered.filter((b: any) => b.status !== 'VOIDED').reduce((s: number, b: any) => s + Number(b.totalAmount ?? 0), 0);

  if (isLoading) return <ListLoadingScreen />;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.gray50 }}>
      <FlatList
        data={filtered}
        keyExtractor={(b: any) => b.id}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={C.navy} />}
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        ListHeaderComponent={
          <View style={{ marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={T.h1}>Payments</Text>
              <ProfileAvatarButton size={34} />
            </View>
            <Text style={{ fontSize: 13, color: C.gray500, marginBottom: 14 }}>Your payment history</Text>

            {/* Summary card */}
            <View style={{ backgroundColor: C.navy, borderRadius: 18, padding: 18, marginBottom: 14 }}>
              <Text style={{ fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.55)', letterSpacing: 1.2, marginBottom: 4 }}>
                {dateFilter === 'today' ? 'PAID TODAY' : dateFilter === '7d' ? 'PAID (7 DAYS)' : dateFilter === '30d' ? 'PAID (30 DAYS)' : 'TOTAL PAID'}
              </Text>
              <Text style={{ fontSize: 28, fontWeight: '800', color: '#D4A017' }}>
                ₹{total.toLocaleString('en-IN')}
              </Text>
              <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
                {filtered.filter((b: any) => b.status !== 'VOIDED').length} payment{filtered.length !== 1 ? 's' : ''}
              </Text>
            </View>

            {/* Date filters */}
            <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8 }}>
              {DATE_FILTERS.map((f) => (
                <TouchableOpacity
                  key={f.key}
                  onPress={() => setDateFilter(f.key)}
                  style={{ flex: 1, paddingVertical: 7, borderRadius: 10, backgroundColor: dateFilter === f.key ? C.navy : C.gray100, alignItems: 'center' }}
                >
                  <Text style={{ fontSize: 11, fontWeight: '700', color: dateFilter === f.key ? '#fff' : C.gray600 ?? C.gray500 }}>
                    {f.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Mode filters */}
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {MODE_FILTERS.map((m) => (
                <TouchableOpacity
                  key={m}
                  onPress={() => setModeFilter(m)}
                  style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: modeFilter === m ? C.navy : C.gray100 }}
                >
                  <Text style={{ fontSize: 11, fontWeight: '600', color: modeFilter === m ? '#fff' : C.gray600 ?? C.gray500 }}>
                    {m === 'ALL' ? 'All' : (MODE_BADGE[m]?.label ?? m)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            title="No payments found"
            message={dateFilter === 'today' ? 'No payments recorded today.' : 'No payments match the filter.'}
          />
        }
        renderItem={({ item: b }) => {
          const isVoided = b.status === 'VOIDED';
          const status = BATCH_STATUS[b.status];
          const draws = drawLabel(b);
          return (
            <TouchableOpacity activeOpacity={0.85} onPress={() => setReceiptId(b.id)}>
              <Card style={{ marginBottom: 10, opacity: isVoided ? 0.55 : 1, borderLeftWidth: 4, borderLeftColor: isVoided ? C.gray300 : C.navy }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                      {(() => {
                        const badge = MODE_BADGE[b.paymentMode];
                        return badge ? (
                          <View style={{ backgroundColor: badge.bg, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
                            <Text style={{ fontSize: 11, fontWeight: '700', color: badge.text }}>{badge.label}</Text>
                          </View>
                        ) : (
                          <View style={{ backgroundColor: C.gray200, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
                            <Text style={{ fontSize: 11, fontWeight: '700', color: C.gray700 }}>{b.paymentMode ?? 'Payment'}</Text>
                          </View>
                        );
                      })()}
                      {status && (
                        <View style={{ backgroundColor: status.bg, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
                          <Text style={{ fontSize: 10, fontWeight: '700', color: status.text }}>{status.label}</Text>
                        </View>
                      )}
                    </View>
                    {b.chitName && (
                      <Text style={{ fontSize: 12, color: C.navy, marginBottom: 3 }}>{b.chitName}</Text>
                    )}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <Text style={{ fontSize: 12, color: C.gray400 }}>
                        {fmtDate(b.collectedAt ?? b.createdAt)}
                      </Text>
                      {draws && (
                        <Text style={{ fontSize: 12, color: C.navy, fontWeight: '600' }}>· {draws}</Text>
                      )}
                    </View>
                    {b.collectorName && (
                      <Text style={{ fontSize: 11, color: C.gray400, marginTop: 2 }}>Collected by: {b.collectorName}</Text>
                    )}
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Amount
                      value={Number(b.totalAmount ?? 0)}
                      size="md"
                      color={isVoided ? C.gray400 : C.gray900}
                    />
                    <Text style={{ fontSize: 16, color: C.gray300, marginTop: 4 }}>›</Text>
                  </View>
                </View>
              </Card>
            </TouchableOpacity>
          );
        }}
      />

      {receiptId && <PaymentReceiptModal batchId={receiptId} onClose={() => setReceiptId(null)} />}
    </SafeAreaView>
  );
}
