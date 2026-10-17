import Ionicons from '@expo/vector-icons/Ionicons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useReviewNavigationStore } from '../store/reviewNavigationStore';
import { useEffect, useState } from 'react';
import { Keyboard, Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { getMember, getChit } from '../services/api';
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { C } from './ui';
import { getAccountScope } from '../offline/accountScope';
import { getCompletedOperationCount, getOperation, getVisibleOperations, requestPaymentCancellation } from '../offline/database';
import { refreshSyncState, synchronizeAccount } from '../offline/syncEngine';
import type { QueuedOperation } from '../offline/types';
import { useAuthStore } from '../store/authStore';
import { useOfflinePresentation } from '../offline/useOfflinePresentation';
import { useSyncStore } from '../store/syncStore';

const STATUS: Record<string, { label: string; color: string; icon: keyof typeof Ionicons.glyphMap }> = {
  QUEUED: { label: 'Saved on device', color: '#92400E', icon: 'time-outline' },
  SYNCING: { label: 'Syncing', color: C.navy, icon: 'cloud-upload-outline' },
  RETRYABLE_FAILURE: { label: 'Will retry', color: '#92400E', icon: 'time-outline' },
  PAUSED_ACCESS: { label: 'Access needed', color: '#92400E', icon: 'warning-outline' },
  CANCELLED: { label: 'Cancelled · no money collected', color: '#64748B', icon: 'close-circle-outline' },
  SUCCEEDED: { label: 'Completed', color: '#166534', icon: 'checkmark-circle-outline' },
  CONFLICT: { label: 'Review needed', color: '#B45309', icon: 'warning-outline' },
  PERMANENT_FAILURE: { label: 'Needs attention', color: '#B45309', icon: 'warning-outline' },
};
const money = (amount: unknown) => `₹${Number(amount ?? 0).toLocaleString('en-IN')}`;
function amountOf(entry: QueuedOperation<any>) {
  return entry.action === 'RECORD_PAYMENT' ? entry.payload.amount : entry.action === 'PARTIAL_COLLECT' ? entry.payload.collectedAmount : entry.payload.collectionSnapshot?.requestedAmount;
}
function labelOf(entry: QueuedOperation<any>) {
  const resolution = entry.serverReceipt?.offlineReviewResolution;
  return resolution === 'CANCELLED' ? 'Cancelled · kept in history' : resolution === 'REFUNDED' ? 'Refund recorded'
    : entry.serverReceipt?.cancellationRequest && entry.status !== 'CANCELLED' ? 'Cancellation waiting for verification' : STATUS[entry.status]?.label ?? 'Saved';
}

export function PendingPaymentQueueCard({ memberNames = {}, chitNames = {}, history = false }: {
  memberNames?: Record<string, string>; chitNames?: Record<string, string>; history?: boolean;
}) {
  const { showSync } = useOfflinePresentation();
  const user = useAuthStore((state) => state.user);
  const { pendingCount, conflictCount, failedCount, status } = useSyncStore();
  const queryClient = useQueryClient();
  const [operations, setOperations] = useState<QueuedOperation<any>[]>([]);
  const [limit, setLimit] = useState(25);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<QueuedOperation<any> | null>(null);
  const [completedCount, setCompletedCount] = useState(0);
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const scope = getAccountScope(user);
  const selectedMemberQuery = useQuery({ queryKey: ['saved-payment-member', scope, selected?.payload.memberId],
    queryFn: () => getMember(selected!.payload.memberId), enabled: open && selected?.accountScope === scope && !!selected?.payload.memberId, retry: false, staleTime: 60_000 });
  const selectedAllocations = selected?.payload.allocations?.length ? selected.payload.allocations : selected?.payload.chitId ? [{ chitId: selected.payload.chitId, amount: amountOf(selected) }] : [];
  const selectedChits = useQueries({ queries: selectedAllocations.map((allocation: any) => ({
    queryKey: ['saved-payment-chit', scope, allocation.chitId], queryFn: () => getChit(allocation.chitId),
    enabled: open && selected?.accountScope === scope && !!allocation.chitId, retry: false, staleTime: 60_000,
  })) });
  useEffect(() => { setOpen(false); setSelected(null); setLimit(25); }, [scope]);
  useEffect(() => {
    let active = true;
    if (!showSync || !scope || !['ADMIN', 'STAFF', 'MANAGER'].includes(user?.role ?? '')) {
      setOperations([]); return () => { active = false; };
    }
    if (history) getCompletedOperationCount(scope).then((count) => { if (active) setCompletedCount(count); }).catch(() => {});
    const load = async () => {
      const rows = await getVisibleOperations(scope, limit, history);
      const current = selected ? await getOperation(selected.operationId, scope) : null;
      if (active) {
        setOperations(rows);
        // A selection keeps its details while a confirmation arrives, but can
        // no longer expose Cancel after server acknowledgement.
        if (selected) setSelected(current);
      }
    };
    if (open) load().catch(() => {});
    const timer = open ? setInterval(() => { load().catch(() => {}); }, 3_000) : null;
    return () => { active = false; if (timer) clearInterval(timer); };
  }, [showSync, scope, user?.role, pendingCount, conflictCount, failedCount, status, limit, history, open, selected?.operationId]);

  const count = history ? completedCount : pendingCount + conflictCount + failedCount;
  const attention = !history && conflictCount + failedCount;
  const syncing = !history && status === 'syncing';
  if (!showSync || (!count && !open)) return null;
  const title = history ? 'Collection decisions' : user?.role === 'ADMIN' ? 'Saved payments' : 'Saved collections';
  const subtitle = history ? `${count} completed decision${count === 1 ? '' : 's'}`
    : attention ? `${count} saved · ${attention} need attention`
    : syncing ? `${count} payment${count === 1 ? '' : 's'} syncing`
    : `${count} payment${count === 1 ? '' : 's'} waiting to sync`;
  const accent = history ? '#16805D' : attention ? '#B45309' : C.navy;
  const memberName = (entry: QueuedOperation<any>) => memberNames[entry.payload.memberId ?? entry.payload.collectionSnapshot?.memberId] ?? entry.payload.collectionSnapshot?.memberName ?? 'Member collection';
  const select = (entry: QueuedOperation<any>) => { setSelected(entry); setReason(''); setConfirmed(false); setError(''); };
  const canCancel = selected?.action === 'RECORD_PAYMENT' && user?.role === 'ADMIN' && !selected.serverReviewId && !selected.serverReceiptId
    && !selected.serverReceipt?.cancellationRequest && !['SUCCEEDED', 'CANCELLED', 'SYNCING'].includes(selected.status);

  async function cancel() {
    if (!scope || !selected || !user || !confirmed || busy) return;
    const selectedScope = scope;
    setBusy(true); setError('');
    try {
      await requestPaymentCancellation(selectedScope, selected.operationId, reason, user.id);
      await refreshSyncState(selectedScope);
      const after = await getOperation(selected.operationId, selectedScope);
      if (after?.status !== 'CANCELLED') synchronizeAccount(selectedScope, queryClient).catch(() => {});
      if (getAccountScope(useAuthStore.getState().user) !== selectedScope) return;
      setSelected(await getOperation(selected.operationId, selectedScope));
      setOperations(await getVisibleOperations(selectedScope, limit, history));
      await queryClient.invalidateQueries({ refetchType: 'none' });
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not cancel this payment. Its saved record is preserved.'); }
    finally { setBusy(false); }
  }

  return <>
    {!!count && <TouchableOpacity testID={history ? 'saved-payment-history' : 'saved-payments-summary'} accessibilityRole="button" accessibilityLabel={`${title}. ${subtitle}. Open full list.`} onPress={() => { setSelected(null); setOpen(true); }}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: attention ? '#FDE68A' : C.gray200, backgroundColor: C.surface, borderRadius: 16, padding: 15, marginBottom: 16 }}>
      <View style={{ width: 42, height: 42, borderRadius: 13, backgroundColor: attention ? '#FFFBEB' : C.navy50, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={history ? 'checkmark-circle-outline' : attention ? 'warning-outline' : syncing ? 'cloud-upload-outline' : 'time-outline'} size={24} color={accent} />
      </View>
      <View style={{ flex: 1 }}><Text style={{ color: C.navy, fontSize: 14, fontWeight: '800' }}>{title}</Text>
        <Text style={{ color: accent, fontSize: 12, lineHeight: 18, marginTop: 3 }}>{subtitle}</Text></View>
      <View style={{ backgroundColor: attention ? '#FEF3C7' : C.navy50, borderRadius: 9, paddingHorizontal: 8, paddingVertical: 5 }}><Text style={{ color: accent, fontWeight: '800', fontSize: 12 }}>{count}</Text></View>
      <Ionicons name="chevron-forward" size={17} color={C.gray400} />
    </TouchableOpacity>}
    <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => { if (!busy) setOpen(false); }}>
      <SafeAreaView style={{ flex: 1, backgroundColor: C.gray50 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', padding: 20, gap: 12 }}>
          {selected && <TouchableOpacity accessibilityLabel="Back to saved payments" disabled={busy} onPress={() => setSelected(null)}><Ionicons name="chevron-back" size={24} color={C.navy} /></TouchableOpacity>}
          <View style={{ flex: 1 }}><Text style={{ color: C.navy, fontSize: 21, fontWeight: '800' }}>{selected ? 'Saved payment details' : title}</Text><Text style={{ color: C.gray500, fontSize: 12, marginTop: 4 }}>{selected ? labelOf(selected) : subtitle}</Text></View>
          <TouchableOpacity accessibilityRole="button" disabled={busy} accessibilityLabel="Close saved payments" onPress={() => setOpen(false)} style={{ padding: 10 }}><Ionicons name="close" size={24} color={C.navy} /></TouchableOpacity>
        </View>
        <ScrollView keyboardDismissMode="on-drag" automaticallyAdjustKeyboardInsets keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, paddingTop: 0, paddingBottom: 40 }}>
          {selected ? <>
            <Text style={{ color: C.navy, fontSize: 30, fontWeight: '800', marginBottom: 8 }}>{money(amountOf(selected))}</Text>
            <Text style={{ color: C.navy, fontSize: 16, fontWeight: '700' }}>{selectedMemberQuery.data?.fullName ?? selectedMemberQuery.data?.name ?? memberName(selected)}</Text>
            <Text style={{ color: C.gray500, marginTop: 8 }}>{selected.payload.paymentMode ?? 'CASH'} · {new Date(selected.createdAt).toLocaleString('en-IN')}</Text>
            {!!selected.payload.paymentReference && <Text style={{ color: C.gray600, marginTop: 8 }}>Reference · {selected.payload.paymentReference}</Text>}
            {!!selected.payload.notes && <Text style={{ color: C.gray600, marginTop: 8 }}>{selected.payload.notes}</Text>}
            <Text style={{ color: C.navy, fontSize: 14, fontWeight: '700', marginTop: 24, marginBottom: 10 }}>Requested allocations</Text>
            {selectedAllocations.map((allocation: any, index: number) => <View key={`${allocation.chitId}:${index}`} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, padding: 14, borderBottomWidth: 1, borderBottomColor: C.gray200 }}>
              <Text style={{ color: C.gray600, flex: 1 }}>{(selectedChits[index]?.data as any)?.name ?? chitNames[allocation.chitId] ?? `Selected chit ${index + 1}`}</Text><Text style={{ color: C.navy, fontWeight: '700' }}>{money(allocation.amount)}</Text>
            </View>)}
            {!!selected.lastErrorMessage && <Text style={{ color: '#92400E', lineHeight: 20, marginTop: 20 }}>{selected.lastErrorMessage}</Text>}
            {!!selected.serverReceiptId && <Text style={{ color: '#16805D', lineHeight: 21, marginTop: 20 }}>The server received this payment. Open History to view the receipt or use Void.</Text>}
            {selected.serverReviewId && selected.status === 'CONFLICT' && user?.role === 'ADMIN' && <TouchableOpacity accessibilityRole="button" onPress={() => { setOpen(false); useReviewNavigationStore.getState().openReview(scope!, selected.serverReviewId!); }} style={{ backgroundColor: C.navy, borderRadius: 14, padding: 16, marginTop: 24 }}>
              <Text style={{ color: C.white, textAlign: 'center', fontWeight: '700' }}>Review transaction</Text>
            </TouchableOpacity>}
            {canCancel && <View style={{ marginTop: 26, padding: 16, borderRadius: 16, backgroundColor: C.surface, borderWidth: 1, borderColor: C.gray200 }}>
              <Text style={{ color: C.navy, fontWeight: '700', fontSize: 15 }}>Cancel mistaken entry</Text>
              <Text style={{ color: C.gray500, fontSize: 12, lineHeight: 19, marginTop: 8 }}>Only cancel if no money was collected. Received payments use Void in History. A completed refund needs a refund record.</Text>
              <TextInput accessibilityLabel="Cancellation reason" placeholder="Why is this entry being cancelled?" value={reason} onChangeText={setReason} maxLength={500} multiline returnKeyType="done" blurOnSubmit onSubmitEditing={() => Keyboard.dismiss()} style={{ borderWidth: 1, borderColor: C.gray200, borderRadius: 10, padding: 12, minHeight: 75, marginTop: 14, color: C.navy }} />
              <TouchableOpacity accessibilityRole="checkbox" accessibilityState={{ checked: confirmed }} accessibilityLabel="I confirm no money was collected" onPress={() => setConfirmed(!confirmed)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 16 }}>
                <Ionicons name={confirmed ? 'checkbox' : 'square-outline'} size={23} color={C.navy} /><Text style={{ color: C.gray600, fontSize: 12, flex: 1 }}>I confirm no money was collected</Text>
              </TouchableOpacity>
              <TouchableOpacity accessibilityRole="button" disabled={busy || !confirmed || reason.trim().length < 5} onPress={cancel} style={{ backgroundColor: '#B91C1C', opacity: busy || !confirmed || reason.trim().length < 5 ? 0.4 : 1, padding: 14, borderRadius: 10 }}><Text style={{ color: C.white, fontWeight: '700', textAlign: 'center' }}>{busy ? 'Checking payment…' : 'Cancel payment'}</Text></TouchableOpacity>
            </View>}
            {!!error && <Text accessibilityRole="alert" style={{ color: '#B91C1C', marginTop: 14 }}>{error}</Text>}
          </> : <>
            <Text style={{ color: C.gray500, fontSize: 12, lineHeight: 18, marginBottom: 16 }}>{history ? 'Cancelled entries and refund decisions remain recorded here.' : 'Synced payments appear in History. Tap a saved transaction to view its allocations and available actions.'}</Text>
            {!operations.length && <View style={{ alignItems: 'center', padding: 24, gap: 12 }}><Ionicons name="checkmark-circle-outline" size={32} color="#16805D" /><Text style={{ color: C.gray500 }}>No payments waiting to sync.</Text></View>}
            {operations.filter((entry) => entry.accountScope === scope).map((entry) => {
              const visual = STATUS[entry.status] ?? STATUS.QUEUED;
              return <TouchableOpacity key={entry.operationId} testID={entry.serverReviewId && entry.status === 'CONFLICT' ? 'review-saved-payment' : `saved-payment-${entry.operationId}`} accessibilityRole="button" accessibilityHint="Open saved payment details" onPress={() => select(entry)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, backgroundColor: C.surface, borderRadius: 14, borderWidth: 1, borderColor: C.gray200, marginBottom: 10 }}>
                <Ionicons name={visual.icon} size={23} color={visual.color} />
                <View style={{ flex: 1 }}><Text style={{ color: C.navy, fontWeight: '800', fontSize: 14 }}>{money(amountOf(entry))} · {memberName(entry)}</Text><Text style={{ color: visual.color, fontSize: 11, marginTop: 6 }}>{labelOf(entry)}</Text><Text style={{ color: C.gray400, fontSize: 10, marginTop: 5 }}>{new Date(entry.createdAt).toLocaleString('en-IN')}</Text></View>
                <Ionicons name="chevron-forward" size={17} color={C.gray400} />
              </TouchableOpacity>;
            })}
            {count > operations.length && operations.length === limit && <TouchableOpacity accessibilityRole="button" onPress={() => setLimit(limit + 25)} style={{ paddingVertical: 12 }}><Text style={{ color: C.navy, fontSize: 13, fontWeight: '700' }}>Show more saved entries</Text></TouchableOpacity>}
          </>}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  </>;
}
