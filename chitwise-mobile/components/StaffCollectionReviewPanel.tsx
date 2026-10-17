import { useEffect, useId, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { InputAccessoryView, Keyboard, Platform, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { C, Button } from './ui';
import { requestAsAccount } from '../offline/accountClient';
import { getAccountScope } from '../offline/accountScope';
import { useAuthStore } from '../store/authStore';
import { refreshRecoveredReviews, refreshReviewedPayments } from '../offline/paymentReviews';
import { refreshSyncState } from '../offline/syncEngine';
import { formatRefundTime, parseRefundTime } from '../../shared/offline/refundDate';

const base = '/payments/offline/staff-actions/reviews';
const choices = [
  ['RECORD_CUSTODY', 'Record the original cash pickup. The original collector must be assigned; member approval and remittance still follow.'],
  ['LINK_CUSTODY', 'I verified this is the same physical collection already recorded on the original pickup. Link it without recording another collection.'],
  ['CANCEL_MISTAKE', 'Cancel this mistaken entry. No money was collected for it.'],
  ['RECORD_REFUND', 'The full held cash has already been returned. Record the completed refund.'],
];
const money = (value: unknown) => value == null ? 'Amount needs verification' : `₹${Number(value).toLocaleString('en-IN')}`;

export function StaffCollectionReviewPanel({ scope, initialReviewId, onChanged, memberNames = {} }: {
  scope: string; memberNames?: Record<string, string>; initialReviewId?: string | null; onChanged(): void;
}) {
  const qc = useQueryClient();
  const amountAccessoryId = useId();
  const [listing, setListing] = useState<any>(null), [detail, setDetail] = useState<any>(null);
  const [page, setPage] = useState(0), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [decision, setDecision] = useState(''), [reason, setReason] = useState(''), [amount, setAmount] = useState('');
  const [confirmed, setConfirmed] = useState(false), [method, setMethod] = useState('CASH');
  const [reference, setReference] = useState(''), [returnedAt, setReturnedAt] = useState(formatRefundTime);
  const mounted = useRef(true), requestSequence = useRef(0);
  const current = () => mounted.current && getAccountScope(useAuthStore.getState().user) === scope;
  const call = async (url: string, data?: unknown) => (await requestAsAccount(scope, { url: base + url, method: data ? 'POST' : 'GET', data })).data.data;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; requestSequence.current++; }; }, [scope]);
  useEffect(() => {
    let live = true;
    call(`?page=${page}&size=20`).then((value) => { if (live && current()) setListing(value); })
      .catch((e) => { if (live && current()) setError(e.response?.data?.message ?? e.message); });
    return () => { live = false; };
  }, [scope, page]);
  useEffect(() => { if (initialReviewId) inspect(initialReviewId); }, [scope, initialReviewId]);
  async function inspect(id: string) {
    const sequence = ++requestSequence.current;
    setBusy(true); setError(''); setDetail(null); setDecision(''); setReason(''); setConfirmed(false); setReference('');
    try { const value = await call(`/${id}`); if (current() && sequence === requestSequence.current) {
      setDetail({ ...value, memberName: memberNames[value.memberId] });
      Promise.allSettled([
        value.memberId ? requestAsAccount(scope, { method: 'GET', url: `/members/${value.memberId}` }) : Promise.resolve(null),
        value.chitId ? requestAsAccount(scope, { method: 'GET', url: `/chits/${value.chitId}` }) : Promise.resolve(null),
      ]).then(([member, chit]) => { if (current() && sequence === requestSequence.current) {
        const m = member.status === 'fulfilled' ? member.value?.data.data : null;
        const c = chit.status === 'fulfilled' ? chit.value?.data.data : null;
        setDetail((prior: any) => prior?.id === value.id ? { ...prior, memberName: m?.fullName ?? m?.name ?? prior.memberName, chitName: c?.name } : prior);
      } });
      setAmount(value.amount == null ? '' : String(value.amount)); setMethod('CASH'); setReturnedAt(formatRefundTime());
    } } catch (e: any) { if (current() && sequence === requestSequence.current) setError(e.response?.data?.message ?? e.message); }
    finally { if (current() && sequence === requestSequence.current) setBusy(false); }
  }
  async function resolve() {
    setBusy(true); setError('');
    try {
      await call(`/${detail.id}/resolve`, { decision, reason: reason.trim(), expectedVersion: detail.version,
        actualAmount: decision === 'CANCEL_MISTAKE' ? undefined : Number(amount), confirmed,
        paymentMode: decision === 'RECORD_REFUND' ? method : undefined, reference: decision === 'RECORD_REFUND' ? reference.trim() : undefined,
        refundedAt: decision === 'RECORD_REFUND' ? parseRefundTime(returnedAt) : undefined });
      if (current()) {
        setDetail(null);
        setListing((prior: any) => prior ? { ...prior, content: prior.content.filter((entry: any) => entry.id !== detail.id), totalElements: Math.max(0, prior.totalElements - 1) } : prior);
        void qc.invalidateQueries({ refetchType: 'active' }).catch(() => {}); onChanged();
        // Preserve the source queue's outcome even if the reviewer leaves this panel.
        void (async () => {
          await refreshReviewedPayments(scope, true);
          await refreshRecoveredReviews(scope, Date.now() + 20_000);
          await refreshSyncState(scope);
        })().catch(() => {});
        const next = await call(`?page=${page}&size=20`);
        if (current()) { setDetail(null); if (page > 0 && !next.content.length) { setListing(null); setPage(page - 1); } else setListing(next); }
      }
    } catch (e: any) { if (current()) { setError(e.response?.data?.message ?? e.message); setConfirmed(false); } }
    finally { if (current()) setBusy(false); }
  }
  const input = { borderWidth: 1, borderColor: C.gray200, borderRadius: 10, padding: 13, color: C.gray900 };
  return <View style={{ gap: 14 }}>
    <Text style={{ color: C.gray600, lineHeight: 20 }}>A staff pickup records who holds the cash. Member dues change only after the normal collection approval and remittance.</Text>
    {!!error && (!detail || !decision) && <Text accessibilityRole="alert" style={{ color: C.red }}>{error}</Text>}
    {!detail ? <>
      {!listing ? <Text>Loading pickup reviews…</Text> : !listing.content.length ? <Text style={{ color: C.green }}>No staff pickups waiting for review.</Text>
        : listing.content.map((entry: any) => <TouchableOpacity key={entry.id} disabled={busy} accessibilityRole="button" onPress={() => inspect(entry.id)}
          style={{ borderRadius: 14, padding: 16, backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A' }}>
          <Text style={{ color: C.navy, fontWeight: '800' }}>{money(entry.amount)} · {memberNames[entry.memberId] ?? 'Member'} · {entry.originalRole === 'MANAGER' ? 'Manager' : 'Staff'} pickup</Text>
          <Text style={{ color: C.gray600, fontSize: 12, marginTop: 6 }}>Task or account access changed · {new Date(entry.recordedAt).toLocaleString('en-IN')}</Text>
        </TouchableOpacity>)}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Button label="Previous pickups" variant="ghost" disabled={!page || busy} onPress={() => { setListing(null); setPage(page - 1); }} />
        <Button label="Next pickups" variant="ghost" disabled={!listing || listing.last || busy} onPress={() => { setListing(null); setPage(page + 1); }} /></View>
    </> : <>
      <View style={{ padding: 16, borderRadius: 14, backgroundColor: '#FFFBEB', gap: 7 }}>
        <Text style={{ color: C.navy, fontWeight: '800', fontSize: 18 }}>{money(detail.amount)}</Text>
        <Text style={{ color: C.navy }}>{detail.memberName ?? 'Member collection'}{detail.chitName ? ` · ${detail.chitName}` : ''}</Text>
        <Text style={{ color: C.gray600 }}>Original collector: {detail.collectorName ?? 'Name unavailable'}</Text>
        <Text selectable style={{ color: C.gray500, fontSize: 12 }}>Pickup: {detail.requestId}</Text>
        <Text style={{ color: C.gray600 }}>Current task: {detail.current?.status?.replaceAll('_',' ') ?? 'Unavailable'}{detail.current ? ` · ${detail.current.assignedToOriginalCollector ? 'Assigned to original collector' : 'Assignment changed'}` : ''}</Text>
        <Text style={{ color: C.gray600 }}>Recorded {new Date(detail.recordedAt).toLocaleString('en-IN')}</Text>
      </View>
      {detail.status !== 'PENDING' ? <Text style={{ color: C.green }}>Decision recorded: {detail.status} · {detail.resolutionReason}</Text> : <>
        {choices.map(([value,label]) => <TouchableOpacity key={value} accessibilityRole="radio" accessibilityState={{ checked: decision === value }} disabled={busy}
          onPress={() => { setDecision(value); setConfirmed(false); }} style={{ borderWidth: 1, borderColor: decision === value ? C.navy : C.gray200, padding: 14, borderRadius: 12 }}>
          <Text style={{ color: C.navy }}>{decision === value ? '● ' : '○ '}{label}</Text></TouchableOpacity>)}
        {!!decision && <>
          {decision !== 'CANCEL_MISTAKE' && <>
            <TextInput accessibilityLabel="Actual original collected amount" value={amount} onChangeText={setAmount} editable={detail.amount == null && !busy} keyboardType="decimal-pad" inputAccessoryViewID={Platform.OS === 'ios' ? amountAccessoryId : undefined} placeholder="Actual original collected amount" style={input} />
            {Platform.OS === 'ios' && <InputAccessoryView nativeID={amountAccessoryId}>
              <View style={{ backgroundColor: C.gray100, borderTopWidth: 1, borderColor: C.gray200, alignItems: 'flex-end', paddingHorizontal: 16 }}>
                <TouchableOpacity accessibilityRole="button" accessibilityLabel="Done entering pickup amount" onPress={() => Keyboard.dismiss()} style={{ padding: 14 }}><Text style={{ color: C.navy, fontWeight: '700' }}>Done</Text></TouchableOpacity>
              </View>
            </InputAccessoryView>}
          </>}
          {decision === 'RECORD_REFUND' && <>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{['CASH','UPI','BANK_TRANSFER','CHEQUE'].map((m) => <TouchableOpacity key={m} disabled={busy} onPress={() => setMethod(m)} style={{ backgroundColor: method === m ? C.navy : C.gray100, padding: 10, borderRadius: 8 }}><Text style={{ color: method === m ? C.white : C.navy }}>{m.replace('_',' ')}</Text></TouchableOpacity>)}</View>
            <TextInput accessibilityLabel="Pickup refund reference" value={reference} onChangeText={setReference} placeholder="Completed refund reference" maxLength={200} style={input} />
            <TextInput accessibilityLabel="Pickup refund date" value={returnedAt} onChangeText={setReturnedAt} placeholder="DD/MM/YYYY HH:mm" style={input} />
          </>}
          <TextInput accessibilityLabel="Pickup review reason" value={reason} onChangeText={setReason} returnKeyType="done" submitBehavior="blurAndSubmit" onSubmitEditing={() => Keyboard.dismiss()} placeholder="Explain the verified outcome" multiline maxLength={500} style={input} />
          <TouchableOpacity accessibilityRole="checkbox" accessibilityState={{ checked: confirmed }} disabled={busy} onPress={() => { Keyboard.dismiss(); setConfirmed(!confirmed); }} style={{ paddingVertical: 12 }}>
            <Text style={{ color: C.navy }}>{confirmed ? '☑ ' : '☐ '}{decision === 'CANCEL_MISTAKE' ? 'No money was collected for this entry.' : decision === 'RECORD_REFUND' ? 'The full original collection has already been returned.' : 'I verified the original collector, amount and this physical collection.'}</Text>
          </TouchableOpacity>
          {!!error && <Text accessibilityRole="alert" style={{ color: C.red }}>{error}</Text>}
          <Button label="Confirm pickup decision" loading={busy} disabled={!confirmed || reason.trim().length < 5 || (decision !== 'CANCEL_MISTAKE' && (!Number.isFinite(Number(amount)) || Number(amount) <= 0)) || (decision === 'RECORD_REFUND' && reference.trim().length < 3)} onPress={resolve} />
        </>}
      </>}
      <Button label="Refresh pickup details" variant="ghost" disabled={busy} onPress={() => inspect(detail.id)} />
      <Button label="Back to pickup reviews" variant="ghost" disabled={busy} onPress={() => { requestSequence.current++; setDetail(null); setError(''); }} />
    </>}
  </View>;
}
