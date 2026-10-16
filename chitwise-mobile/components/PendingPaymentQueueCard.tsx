import { useEffect, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { C } from './ui';
import { getAccountScope } from '../offline/accountScope';
import { getVisibleOperations } from '../offline/database';
import type { QueuedOperation } from '../offline/types';
import { useAuthStore } from '../store/authStore';
import { useSyncStore } from '../store/syncStore';

const STATUS: Record<string, { label: string; color: string; background: string }> = {
  QUEUED: { label: 'Saved on device', color: '#92400E', background: '#FFFBEB' },
  SYNCING: { label: 'Syncing', color: C.navy, background: C.navy50 },
  RETRYABLE_FAILURE: { label: 'Will retry', color: '#92400E', background: '#FFFBEB' },
  PAUSED_ACCESS: { label: 'Saved · access needed', color: '#92400E', background: '#FFFBEB' },
  SUCCEEDED: { label: 'Synced', color: '#166534', background: '#F0FDF4' },
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
  const [operations, setOperations] = useState<QueuedOperation<any>[]>([]);
  const [limit, setLimit] = useState(5);
  const scope = getAccountScope(user);

  useEffect(() => {
    let active = true;
    if (!scope || !['ADMIN', 'STAFF', 'MANAGER'].includes(user?.role ?? '')) {
      setOperations([]);
      return () => { active = false; };
    }
    getVisibleOperations(scope, limit)
      .then((rows) => { if (active) setOperations(rows); })
      .catch(() => { if (active) setOperations([]); });
    return () => { active = false; };
  }, [scope, user?.role, pendingCount, conflictCount, failedCount, status, limit]);

  const visible = operations.filter((operation) => operation.accountScope === scope);
  if (visible.length === 0) return null;
  const outstandingCount = pendingCount + conflictCount + failedCount;

  return (
    <View style={{ backgroundColor: C.surface, borderWidth: 1, borderColor: C.gray200, borderRadius: 14, padding: 14, marginBottom: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: 14, fontWeight: '800', color: C.navy }}>{user?.role === 'ADMIN' ? 'Saved payment activity' : 'Saved collection activity'}</Text>
          <Text style={{ fontSize: 11, color: C.gray500, marginTop: 2 }}>{user?.role === 'ADMIN'
            ? 'Saved entries stay here until the server confirms them.' : 'Sync confirms the pickup record. Member credit follows admin receipt.'}</Text>
        </View>
        <View style={{ minWidth: 26, height: 26, paddingHorizontal: 7, borderRadius: 13, backgroundColor: C.navy50, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 12, color: C.navy, fontWeight: '800' }}>{outstandingCount || '✓'}</Text>
        </View>
      </View>

      {visible.map((operation, index) => {
        const payment = operation.payload;
        const snapshot = payment.collectionSnapshot;
        const amount = operation.action === 'RECORD_PAYMENT' ? payment.amount
          : operation.action === 'PARTIAL_COLLECT' ? payment.collectedAmount : snapshot?.requestedAmount;
        const memberName = memberNames[payment.memberId ?? snapshot?.memberId] ?? snapshot?.memberName ?? 'Member collection';
        const mode = operation.action === 'RECORD_PAYMENT' ? payment.paymentMode?.replace(/_/g, ' ')
          : operation.action === 'MARK_PICKUP' ? 'CASH · Pickup' : 'CASH · Partial collection';
        const visual = STATUS[operation.status] ?? STATUS.QUEUED;
        return (
          <View key={operation.operationId} style={{ paddingTop: index === 0 ? 2 : 11, paddingBottom: 10, borderTopWidth: index === 0 ? 0 : 1, borderTopColor: C.gray100 }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: 14, fontWeight: '800', color: C.gray900 }} numberOfLines={1}>
                  {amount != null ? `₹${Number(amount).toLocaleString('en-IN')}` : 'Saved collection'} · {memberName}
                </Text>
                <Text style={{ fontSize: 11, color: C.gray500, marginTop: 3 }} numberOfLines={1}>
                  {mode}{payment.paymentReference ? ` · ${payment.paymentReference}` : ''} · {createdLabel(operation.createdAt)}
                </Text>
                {operation.lastErrorMessage ? (
                  <Text style={{ fontSize: 11, color: visual.color, marginTop: 4 }} numberOfLines={2}>{operation.lastErrorMessage}</Text>
                ) : null}
              </View>
              <View style={{ backgroundColor: visual.background, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 }}>
                <Text style={{ fontSize: 10, fontWeight: '800', color: visual.color }}>{operation.serverReceipt?.offlineReviewResolution === 'DUPLICATE' ? 'Linked to original receipt' : visual.label}</Text>
              </View>
            </View>
          </View>
        );
      })}
      {visible.length === limit && <TouchableOpacity accessibilityRole="button" onPress={() => setLimit(limit + 25)} style={{ paddingVertical: 10 }}>
        <Text style={{ color: C.navy, fontSize: 12, fontWeight: '700' }}>Show more saved entries</Text>
      </TouchableOpacity>}
    </View>
  );
}
