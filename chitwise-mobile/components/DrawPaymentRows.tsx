import { View, Text, TouchableOpacity } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { getDrawPayments } from '../services/api';
import { ReadDataBoundary } from './ReadDataBoundary';
import { C } from './ui';
import { isPaymentCleared, hasOutstandingPayment } from '../utils/paymentStatus';

const PAY_STATUS_COLOR: Record<string, string> = {
  SETTLED: C.green, SETTLEMENT_CLEARED: C.green, WAIVED: C.gray400,
  PAYOUT_DEDUCTED: C.navy, PARTIALLY_PAID: C.amber, OUTSTANDING: C.red,
  CREDIT_COVERED: C.green, PARTIAL_CREDIT: C.amber,
};
const PAY_STATUS_LABEL: Record<string, string> = {
  SETTLED: 'Settled', SETTLEMENT_CLEARED: 'Settled', WAIVED: 'Waived',
  PAYOUT_DEDUCTED: 'Payout', PARTIALLY_PAID: 'Partial', OUTSTANDING: 'Pending',
  CREDIT_COVERED: 'Credit', PARTIAL_CREDIT: 'Partial Credit',
};

// Sub-component: fetches real per-draw payment records (includes SETTLEMENT_CLEARED)
export function DrawPaymentRows({ drawId, drawStatus, memberMap, installmentAmount, onCollect, queryKeyPrefix = 'draw-payments' }: {
  queryKeyPrefix?: string;
  drawId: string;
  drawStatus: string;
  memberMap: Record<string, string>;
  installmentAmount?: number;
  onCollect: (memberId: string) => void;
}) {
  const { data: payments = [], isLoading } = useQuery({
    queryKey: [queryKeyPrefix, drawId],
    queryFn: () => getDrawPayments(drawId),
    staleTime: 30_000,
    enabled: !!drawId,
  });

  const cleared = (payments as any[]).filter((p: any) => isPaymentCleared(p.status)).length;
  const total = (payments as any[]).length;

  if (isLoading) return (
    <ReadDataBoundary label="Instalments" queryKeys={[[queryKeyPrefix, drawId]]}><View style={{ paddingVertical: 12, alignItems: 'center' }}>
      <Text style={{ fontSize: 12, color: C.gray400 }}>Loading payments…</Text>
    </View></ReadDataBoundary>
  );
  if (payments.length === 0) return (
    <ReadDataBoundary label="Instalments" queryKeys={[[queryKeyPrefix, drawId]]}><View style={{ marginTop: 12 }}>
      <Text style={{ fontSize: 12, color: C.gray400 }}>No payment records for this draw.</Text>
    </View></ReadDataBoundary>
  );

  return (
    <ReadDataBoundary label="Instalments" queryKeys={[[queryKeyPrefix, drawId]]}><View style={{ marginTop: 12 }}>
      <Text style={{ fontSize: 12, fontWeight: '700', color: C.gray700, marginBottom: 8 }}>
        Member Payments ({cleared}/{total} cleared)
      </Text>
      {(payments as any[]).map((p: any) => {
        const mName = memberMap[p.memberId] ?? 'Unknown';
        const isCleared = isPaymentCleared(p.status);
        const isPendingSync = p._pendingSync === true;
        const canCollect = !isPendingSync && hasOutstandingPayment(p.status) && drawStatus === 'OPEN';
        const dotColor = isPendingSync ? C.amber : (PAY_STATUS_COLOR[p.status] ?? C.gray400);
        const label = `${PAY_STATUS_LABEL[p.status] ?? p.status?.replace(/_/g, ' ') ?? ''}${isPendingSync ? ' ↑' : ''}`;
        const outstanding = Number(p.balance ?? 0);
        const pct = p.amountDue > 0 ? Math.min(100, Math.round((p.amountPaid / p.amountDue) * 100)) : 0;
        const effectivePct = isCleared ? 100 : pct;
        const barColor = isCleared ? C.green : pct > 0 ? C.navy : C.red;

        return (
          <View key={p.id} style={{
            paddingVertical: 8, borderTopWidth: 1, borderTopColor: C.gray100,
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dotColor }} />
                <Text style={{ fontSize: 13, color: C.gray900, fontWeight: '500', flex: 1 }}>{mName}</Text>
                <Text style={{ fontSize: 11, fontWeight: '700', color: dotColor }}>{label}</Text>
              </View>
              {canCollect && (
                <TouchableOpacity
                  onPress={() => onCollect(p.memberId)}
                  style={{ marginLeft: 8, backgroundColor: C.green + '15', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 }}>
                  <Text style={{ fontSize: 12, color: C.green, fontWeight: '700' }}>Collect</Text>
                </TouchableOpacity>
              )}
            </View>
            {/* Progress bar */}
            <View style={{ marginTop: 5, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ flex: 1, height: 4, backgroundColor: C.gray100, borderRadius: 2 }}>
                <View style={{ width: `${effectivePct}%`, height: 4, backgroundColor: barColor, borderRadius: 2 }} />
              </View>
              {outstanding > 0 && !isCleared ? (
                <Text style={{ fontSize: 10, color: C.red, fontWeight: '600' }}>₹{outstanding.toLocaleString('en-IN')} due</Text>
              ) : isCleared ? (
                <Text style={{ fontSize: 10, color: C.green, fontWeight: '600' }}>Clear ✓</Text>
              ) : null}
            </View>
          </View>
        );
      })}
    </View></ReadDataBoundary>
  );
}

