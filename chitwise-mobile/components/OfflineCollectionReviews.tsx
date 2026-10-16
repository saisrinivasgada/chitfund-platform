import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Alert, Keyboard, KeyboardAvoidingView, Modal, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { C, Button } from './ui';
import { useAuthStore } from '../store/authStore';
import { getAccountScope } from '../offline/accountScope';
import { getOfflinePaymentReview, getOfflinePaymentReviewMatches, loadOfflinePaymentReviews, refreshReviewedPayments, resolveOfflinePaymentReview } from '../offline/paymentReviews';
import { refreshSyncState } from '../offline/syncEngine';
import { useSyncStore } from '../store/syncStore';

const money = (value: unknown) => `₹${Number(value ?? 0).toLocaleString('en-IN')}`;
const date = (value: string) => value ? new Date(value).toLocaleString('en-IN') : 'Time unavailable';

export function OfflineCollectionReviews({ memberNames = {} }: { memberNames?: Record<string, string> }) {
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const scope = getAccountScope(user);
  const isOnline = useSyncStore((state) => state.isOnline);
  const [open, setOpen] = useState(false);
  const [listing, setListing] = useState<any>(null);
  const [detail, setDetail] = useState<any>(null);
  const [page, setPage] = useState(0);
  const [decision, setDecision] = useState('');
  const [reason, setReason] = useState('');
  const [receiptId, setReceiptId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [matches, setMatches] = useState<any[]>([]);
  const [matchPage, setMatchPage] = useState(0);
  const [moreMatches, setMoreMatches] = useState(false);
  const current = () => !!scope && getAccountScope(useAuthStore.getState().user) === scope;

  useEffect(() => { setOpen(false); setDetail(null); setListing(null); setPage(0); setBusy(false); setError('');
    setDecision(''); setReason(''); setReceiptId(''); }, [scope]);
  useEffect(() => {
    if (!scope || !open || user?.role !== 'ADMIN') return;
    let active = true;
    setError('');
    loadOfflinePaymentReviews(scope, page).then((value) => {
      if (active && getAccountScope(useAuthStore.getState().user) === scope) setListing(value);
    }).catch((err) => { if (active && getAccountScope(useAuthStore.getState().user) === scope) setError(err?.response?.data?.message ?? err.message); });
    return () => { active = false; };
  }, [scope, page, open, user?.role]);

  if (!scope || user?.role !== 'ADMIN') return null;

  async function inspect(id: string) {
    setBusy(true); setError(''); setDecision(''); setReason(''); setReceiptId('');
    try { const value = await getOfflinePaymentReview(scope!, id); if (current()) {
      setDetail(value); setMatches(value.possibleMatches?.content ?? value.recentPayments ?? []);
      setMatchPage(0); setMoreMatches(value.possibleMatches ? !value.possibleMatches.last : false);
    } }
    catch (err: any) { if (current()) setError(err?.response?.data?.message ?? err.message); }
    finally { if (current()) setBusy(false); }
  }
  async function loadMoreMatches() {
    setBusy(true);
    try {
      const values = await getOfflinePaymentReviewMatches(scope!, detail.id, matchPage + 1);
      if (current()) { setMatches((prior) => [...new Map([...prior, ...values.content].map((receipt) => [receipt.id, receipt])).values()]);
        setMatchPage(matchPage + 1); setMoreMatches(!values.last); }
    } catch (err: any) { if (current()) setError(err?.response?.data?.message ?? err.message); }
    finally { if (current()) setBusy(false); }
  }
  async function resolve() {
    setBusy(true); setError('');
    try {
      await resolveOfflinePaymentReview(scope!, detail.id, { decision, reason: reason.trim(),
        expectedBalanceVersion: detail.balance.version, existingReceiptId: decision === 'LINK_DUPLICATE' ? receiptId.trim() : undefined });
      if (current()) await queryClient.invalidateQueries({ refetchType: 'active' });
      await refreshReviewedPayments(scope!, true); await refreshSyncState(scope!);
      const values = await loadOfflinePaymentReviews(scope!, page);
      if (current()) {
        if (page > 0 && !values.content.length) { setListing(null); setPage(page - 1); }
        else setListing(values);
        setDetail(null);
      }
    } catch (err: any) {
      if (current()) { setError(err?.response?.data?.message ?? err.message); setDecision(''); }
    } finally { if (current()) setBusy(false); }
  }
  const choices = [
    ['APPLY_WITH_EXCESS', 'I verified this is a separate collection. Apply current dues first, other chits next, and keep any remainder as member credit.'],
    ['LINK_DUPLICATE', 'This is the same collection as an existing receipt. Link it without posting money again.'],
  ];

  return <>
    <TouchableOpacity accessibilityRole="button" onPress={() => { if (!isOnline) { Alert.alert('Connect to review', 'Saved collections remain preserved. Connect to check current balances and review them.'); return; } setOpen(true); setDetail(null); }}
      style={{ borderRadius: 12, padding: 14, backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A', marginBottom: 16 }}>
      <Text style={{ color: '#92400E', fontWeight: '800', fontSize: 13 }}>Offline collection reviews →</Text>
      <Text style={{ color: C.gray600, fontSize: 11, marginTop: 3 }}>Review changed dues and possible duplicates.</Text>
    </TouchableOpacity>
    <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
      <SafeAreaView style={{ flex: 1, backgroundColor: C.surface }}>
        <View style={{ padding: 18, flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ color: C.navy, fontWeight: '800', fontSize: 19 }}>Collection reviews</Text>
          <TouchableOpacity disabled={busy} onPress={() => setOpen(false)}><Text style={{ color: C.navy }}>Close</Text></TouchableOpacity>
        </View>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 18, paddingTop: 0, gap: 14 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
          <Text style={{ color: C.gray600, fontSize: 13 }}>Collections remain preserved on the server while waiting. No additional money is applied while a collection waits here.</Text>
          {!!error && <Text accessibilityRole="alert" style={{ color: C.red }}>{error}</Text>}
          {!detail ? <>
            {!listing ? <Text style={{ color: C.gray600 }}>Connect to load collections waiting for review.</Text>
              : !listing.content.length ? <Text style={{ color: C.green }}>No collections waiting for review.</Text>
                : listing.content.map((entry: any) => <TouchableOpacity key={entry.id} disabled={busy} onPress={() => inspect(entry.id)}
                  style={{ padding: 16, backgroundColor: '#FFFBEB', borderColor: '#FDE68A', borderWidth: 1, borderRadius: 14 }}>
                  <Text style={{ color: C.navy, fontSize: 16, fontWeight: '800' }}>{money(entry.amount)} · {memberNames[entry.memberId] ?? 'Member collection'}</Text>
                  <Text style={{ color: '#92400E', fontSize: 12, marginTop: 5 }}>{entry.reviewReason === 'LEGACY_UNVERIFIED' ? 'Older collection — verify the original record'
                    : entry.reviewReason === 'MEMBER_CHANGED' ? 'Member status changed — verify the collection'
              : ['DUES_CHANGED', 'PICKUP_DUES_CHANGED'].includes(entry.reviewReason) ? 'Collection exceeds current dues' : 'Possible duplicate — check the receipts'}</Text>
                  <Text style={{ color: C.gray500, fontSize: 11, marginTop: 5 }}>{date(entry.recordedAt)} · {entry.paymentMode}</Text>
                </TouchableOpacity>)}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Button label="Previous" variant="ghost" disabled={page === 0 || busy} onPress={() => { setListing(null); setPage(page - 1); }} />
              <Button label="Next" variant="ghost" disabled={!listing || listing.last || busy} onPress={() => { setListing(null); setPage(page + 1); }} />
            </View>
          </> : <>
            <View style={{ padding: 16, backgroundColor: '#FFFBEB', borderRadius: 14, gap: 7 }}>
              <Text style={{ color: C.navy, fontWeight: '800', fontSize: 16 }}>{memberNames[detail.memberId] ?? 'Member collection'}</Text>
              <Text style={{ color: '#92400E', fontWeight: '800', fontSize: 19 }}>{money(detail.amount)} collected · {money(detail.balance.selectedOutstanding)} due in this chit</Text>
              <Text style={{ color: C.gray600, fontSize: 12 }}>All-chit dues: {money(detail.balance.totalOutstanding)} · Credit: {money(detail.balance.creditBalance)}</Text>
              <Text style={{ color: C.gray500, fontSize: 11 }}>{date(detail.recordedAt)} · {detail.paymentMode}{detail.paymentReference ? ` · ${detail.paymentReference}` : ''}</Text>
            </View>
            <Text style={{ color: C.gray600, fontSize: 12 }}>Check the receipts and whether separate money was received. A matching amount alone does not establish a duplicate.</Text>
            {matches.length > 0 && <View style={{ padding: 13, borderRadius: 12, borderWidth: 1, borderColor: C.gray200, gap: 8 }}>
              <Text style={{ color: C.navy, fontSize: 12, fontWeight: '700' }}>Receipts to compare</Text>
              {matches.map((receipt: any) => <Text key={receipt.id} style={{ color: C.gray600, fontSize: 11 }}>{money(receipt.totalAmount)} · {receipt.paymentMode} · {date(receipt.recordedAt ?? receipt.createdAt)} · {receipt.paymentReference ?? receipt.id}</Text>)}
              {moreMatches && <Button label="Load older matches" variant="ghost" disabled={busy} onPress={loadMoreMatches} />}
            </View>}
            {detail.reviewReason === 'LEGACY_UNVERIFIED' && <Text style={{ color: '#92400E', fontSize: 12 }}>This older record has no signed offline authorisation. Verify the original collection and its date before approving it.</Text>}
            {detail.status !== 'PENDING' && <Text style={{ color: C.green, fontSize: 12 }}>Already reviewed · {detail.status} · Receipt {detail.receiptId}</Text>}
            {choices.map(([value, label]) => <TouchableOpacity key={value} disabled={busy} onPress={() => setDecision(value)}
              style={{ padding: 14, borderWidth: 1.5, borderColor: decision === value ? C.navy : C.gray200, borderRadius: 12 }}>
              <Text style={{ color: C.navy, fontSize: 13 }}>{decision === value ? '●' : '○'} {label}</Text>
            </TouchableOpacity>)}
            {!!detail.originalAllocations?.length && decision === 'APPLY_WITH_EXCESS' && <Text style={{ color: '#92400E', fontSize: 12 }}>This decision replaces the original chit allocations with the reviewed distribution above.</Text>}
            {decision === 'LINK_DUPLICATE' && <>
              {matches.filter((receipt: any) => receipt.status === 'COMPLETED').map((receipt: any) => <TouchableOpacity key={receipt.id} onPress={() => setReceiptId(receipt.id)}>
                <Text style={{ color: receiptId === receipt.id ? C.navy : C.gray600, fontSize: 12 }}>{receiptId === receipt.id ? '●' : '○'} {money(receipt.totalAmount)} · {date(receipt.recordedAt ?? receipt.createdAt)} · {receipt.paymentReference ?? receipt.id}</Text>
              </TouchableOpacity>)}
              <TextInput accessibilityLabel="Original receipt ID" value={receiptId} onChangeText={setReceiptId} autoCapitalize="none"
                placeholder="Original receipt ID" style={{ padding: 13, borderWidth: 1, borderColor: C.gray300, borderRadius: 12, color: C.navy }} />
            </>}
            <TextInput accessibilityLabel="Review reason" value={reason} onChangeText={setReason} multiline maxLength={500}
              returnKeyType="done" submitBehavior="blurAndSubmit" onSubmitEditing={() => Keyboard.dismiss()}
              placeholder="Explain what you verified and why" style={{ padding: 13, minHeight: 85, borderWidth: 1, borderColor: C.gray300, borderRadius: 12, color: C.navy }} />
            <Button label="Confirm reviewed decision" loading={busy} disabled={!isOnline || detail.status !== 'PENDING' || !decision || reason.trim().length < 5 || (decision === 'LINK_DUPLICATE' && !receiptId.trim())} onPress={resolve} />
            <Button label="Refresh figures" variant="ghost" disabled={busy} onPress={() => inspect(detail.id)} />
            <Button label="Keep waiting" variant="ghost" disabled={busy} onPress={() => setDetail(null)} />
          </>}
        </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  </>;
}
