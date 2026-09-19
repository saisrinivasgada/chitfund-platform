import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { C } from './ui';
import { getAccountScope } from '../offline/accountScope';
import { getVisibleOperations } from '../offline/database';
import type { QueuedOperation } from '../offline/types';
import type { RecordPaymentPayload } from '../offline/paymentQueue';
import { useAuthStore } from '../store/authStore';
import { useSyncStore } from '../store/syncStore';

const STATUS: Record<string, { label: string; color: string; background: string }> = {
  QUEUED: { label: 'Saved on device', color: '#92400E', background: '#FFFBEB' },
  SYNCING: { label: 'Syncing', color: C.navy, background: C.navy50 },
  RETRYABLE_FAILURE: { label: 'Will retry', color: '#92400E', background: '#FFFBEB' },
  CONFLICT: { label: 'Review needed', color: '#991B1B', background: '#FEF2F2' },
  PERMANENT_FAILURE: { label: 'Could not post', color: '#991B1B', background: '#FEF2F2' },
};

function createdLabel(value: number): string {
  const minutes = Math.max(0, Math.floor((Date.now() - value) / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export function PendingPaymentQueueCard({ memberNames = {} }: { memberNames?: Record<string, string> }) {
  const user = useAuthStore((state) => state.user);
  const { pendingCount, conflictCount, failedCount, status } = useSyncStore();
  const [operations, setOperations] = useState<QueuedOperation<RecordPaymentPayload>[]>([]);
  const scope = getAccountScope(user);

  useEffect(() => {
    let active = true;
    if (!scope || user?.role !== 'ADMIN') {
      setOperations([]);
      return () => { active = false; };
    }
    getVisibleOperations(scope, 5)
      .then((rows) => { if (active) setOperations(rows as QueuedOperation<RecordPaymentPayload>[]); })
      .catch(() => { if (active) setOperations([]); });
    return () => { active = false; };
  }, [scope, user?.role, pendingCount, conflictCount, failedCount, status]);

  if (operations.length === 0) return null;
  const outstandingCount = pendingCount + conflictCount + failedCount;

  return (
    <View style={{ backgroundColor: C.white, borderWidth: 1, borderColor: C.gray200, borderRadius: 14, padding: 14, marginBottom: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: 14, fontWeight: '800', color: C.navy }}>Saved payment activity</Text>
          <Text style={{ fontSize: 11, color: C.gray500, marginTop: 2 }}>These entries remain encrypted on this device until resolved.</Text>
        </View>
        <View style={{ minWidth: 26, height: 26, paddingHorizontal: 7, borderRadius: 13, backgroundColor: C.navy50, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 12, color: C.navy, fontWeight: '800' }}>{outstandingCount}</Text>
        </View>
      </View>

      {operations.map((operation, index) => {
        const payment = operation.payload;
        const visual = STATUS[operation.status] ?? STATUS.QUEUED;
        return (
          <View key={operation.operationId} style={{ paddingTop: index === 0 ? 2 : 11, paddingBottom: 10, borderTopWidth: index === 0 ? 0 : 1, borderTopColor: C.gray100 }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: 14, fontWeight: '800', color: C.gray900 }} numberOfLines={1}>
                  ₹{Number(payment.amount).toLocaleString('en-IN')} · {memberNames[payment.memberId] ?? 'Member payment'}
                </Text>
                <Text style={{ fontSize: 11, color: C.gray500, marginTop: 3 }} numberOfLines={1}>
                  {payment.paymentMode.replace(/_/g, ' ')}{payment.paymentReference ? ` · ${payment.paymentReference}` : ''} · {createdLabel(operation.createdAt)}
                </Text>
                {operation.lastErrorMessage ? (
                  <Text style={{ fontSize: 11, color: visual.color, marginTop: 4 }} numberOfLines={2}>{operation.lastErrorMessage}</Text>
                ) : null}
              </View>
              <View style={{ backgroundColor: visual.background, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 }}>
                <Text style={{ fontSize: 10, fontWeight: '800', color: visual.color }}>{visual.label}</Text>
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}
