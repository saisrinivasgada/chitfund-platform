import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { activeAccountScope, requestForAccount } from './accountClient';
import { syncSavedPayments } from './outbox';
import Modal from '../components/ui/Modal';
import Button from '../components/ui/Button';

const money = (value) => `₹${Number(value ?? 0).toLocaleString('en-IN')}`;
const date = (value) => value ? new Date(value).toLocaleString() : 'Time unavailable';

export default function OfflineCollectionReviews({ scope, onClose }) {
  const queryClient = useQueryClient();
  const [listing, setListing] = useState(null);
  const [detail, setDetail] = useState(null);
  const [names, setNames] = useState({});
  const [page, setPage] = useState(0);
  const [decision, setDecision] = useState('');
  const [reason, setReason] = useState('');
  const [receiptId, setReceiptId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [matches, setMatches] = useState([]);
  const [matchPage, setMatchPage] = useState(0);
  const [moreMatches, setMoreMatches] = useState(false);
  const current = () => activeAccountScope() === scope;

  useEffect(() => {
    let active = true;
    requestForAccount(scope, `/payments/offline/reviews?page=${page}&size=20`)
      .then((result) => { if (active && activeAccountScope() === scope) setListing(result); })
      .catch((err) => { if (active && activeAccountScope() === scope) setError(err.message); });
    return () => { active = false; };
  }, [scope, page]);

  async function inspect(id) {
    setBusy(true); setError(''); setDecision(''); setReason(''); setReceiptId('');
    try {
      const result = await requestForAccount(scope, `/payments/offline/reviews/${id}`);
      if (!current()) return;
      setDetail(result);
      setMatches(result.possibleMatches?.content ?? result.recentPayments ?? []);
      setMatchPage(0); setMoreMatches(result.possibleMatches ? !result.possibleMatches.last : false);
      const values = await Promise.allSettled([requestForAccount(scope, `/members/${result.memberId}`), requestForAccount(scope, `/chits/${result.chitId}`)]);
      if (current()) setNames({ member: values[0].value?.fullName ?? values[0].value?.name, chit: values[1].value?.name });
    } catch (err) { if (current()) setError(err.message); }
    finally { if (current()) setBusy(false); }
  }

  async function loadMoreMatches() {
    setBusy(true);
    try {
      const next = await requestForAccount(scope, `/payments/offline/reviews/${detail.id}/matches?page=${matchPage + 1}&size=10`);
      if (current()) {
        setMatches((prior) => [...new Map([...prior, ...next.content].map((receipt) => [receipt.id, receipt])).values()]);
        setMatchPage(matchPage + 1); setMoreMatches(!next.last);
      }
    } catch (err) { if (current()) setError(err.message); }
    finally { if (current()) setBusy(false); }
  }

  async function resolve() {
    setBusy(true); setError('');
    try {
      await requestForAccount(scope, `/payments/offline/reviews/${detail.id}/resolve`, {
        method: 'POST', body: { decision, reason: reason.trim(), expectedBalanceVersion: detail.balance.version,
          existingReceiptId: decision === 'LINK_DUPLICATE' ? receiptId : undefined },
      });
      if (current()) await queryClient.invalidateQueries({ refetchType: 'active' });
      await syncSavedPayments();
      const next = await requestForAccount(scope, `/payments/offline/reviews?page=${page}&size=20`);
      if (current()) {
        if (page > 0 && !next.content.length) { setListing(null); setPage(page - 1); }
        else setListing(next);
        setDetail(null);
      }
    } catch (err) {
      if (current()) {
        setError(err.message);
        if (err.status === 409) setDecision(''); // Re-open to see the changed figures.
      }
    } finally { if (current()) setBusy(false); }
  }

  const matching = !detail ? [] : matches.filter((receipt) => receipt.status === 'COMPLETED'
    && receipt.paymentMode === detail.paymentMode && Number(receipt.totalAmount) === Number(detail.amount)
    && (!detail.paymentReference || detail.paymentReference === receipt.paymentReference)) ?? [];

  return <Modal title="Offline collection reviews" onClose={onClose} size="2xl" footer={detail && (<div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" disabled={busy} onClick={() => inspect(detail.id)}>Refresh figures</Button>
        <Button variant="ghost" disabled={busy} onClick={() => setDetail(null)}>Keep waiting</Button>
        <Button loading={busy} disabled={detail.status !== 'PENDING' || !decision || reason.trim().length < 5 || (decision === 'LINK_DUPLICATE' && !receiptId)} onClick={resolve}>Confirm reviewed decision</Button>
      </div>)}>
    <p className="text-sm text-gray-500 mb-4">These collections are preserved on the server and waiting for a decision. No additional money is applied while a collection waits here.</p>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800 mb-3">{error}</p>}
    {!detail ? <>
      {!listing ? <p className="text-sm text-gray-500">Loading saved collections…</p>
        : !listing.content.length ? <p className="rounded-xl bg-emerald-50 p-4 text-emerald-800 text-sm">No collections waiting for review.</p>
          : <div className="space-y-2 max-h-96 overflow-y-auto">{listing.content.map((entry) => <button key={entry.id}
            disabled={busy} onClick={() => inspect(entry.id)} className="w-full text-left border border-amber-200 bg-amber-50/50 rounded-xl p-4 hover:bg-amber-50">
            <p className="font-semibold text-gray-900">{money(entry.amount)} · {entry.paymentMode.replaceAll('_', ' ')}</p>
            <p className="text-xs text-amber-800 mt-1">{entry.reviewReason === 'LEGACY_UNVERIFIED' ? 'Older collection — verify the original record'
              : entry.reviewReason === 'MEMBER_CHANGED' ? 'Member status changed — verify the collection'
              : ['DUES_CHANGED', 'PICKUP_DUES_CHANGED'].includes(entry.reviewReason) ? 'Collection exceeds current dues' : 'Possible duplicate — check the receipts'}</p>
            <p className="text-xs text-gray-500 mt-1">Recorded {date(entry.recordedAt)}{entry.paymentReference ? ` · ${entry.paymentReference}` : ''}</p>
          </button>)}</div>}
      <div className="flex justify-between mt-4"><Button variant="ghost" disabled={page === 0 || busy} onClick={() => { setListing(null); setPage(page - 1); }}>Previous</Button>
        <Button variant="ghost" disabled={!listing || listing.last || busy} onClick={() => { setListing(null); setPage(page + 1); }}>Next</Button></div>
    </> : <>
      <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4">
        <p className="font-semibold text-gray-900">{names.member ?? 'Member collection'}{names.chit ? ` · ${names.chit}` : ''}</p>
        <p className="text-lg font-bold text-amber-950 mt-2">{money(detail.amount)} collected · {money(detail.balance.selectedOutstanding)} currently due in this chit</p>
        <p className="text-xs text-amber-900 mt-2">All-chit dues: {money(detail.balance.totalOutstanding)} · Existing credit: {money(detail.balance.creditBalance)}</p>
        <p className="text-xs text-gray-600 mt-2">Recorded {date(detail.recordedAt)} · {detail.paymentMode.replaceAll('_', ' ')}{detail.paymentReference ? ` · ${detail.paymentReference}` : ''}</p>
      </div>
      <p className="text-xs text-gray-500 mt-3">Check the member’s receipts and confirm whether separate money was received. A matching amount alone does not establish a duplicate.</p>
      {matches.length > 0 && <div className="mt-3 rounded-xl border border-gray-200 p-3">
        <p className="text-xs font-semibold text-gray-700 mb-2">Receipts to compare</p>
        <div className="space-y-2 max-h-36 overflow-y-auto">{matches.map((receipt) => <div key={receipt.id} className="text-xs text-gray-600">
          <p>{money(receipt.totalAmount)} · {receipt.paymentMode?.replaceAll('_', ' ')} · {receipt.paymentReference ?? receipt.id}</p>
          <p className="text-gray-400">Recorded {date(receipt.recordedAt ?? receipt.createdAt)}</p>
        </div>)}</div>
        {moreMatches && <Button size="xs" variant="ghost" disabled={busy} onClick={loadMoreMatches}>Load older matches</Button>}
      </div>}
      {detail.reviewReason === 'LEGACY_UNVERIFIED' && <p className="text-sm text-amber-900 mt-3">This older record has no signed offline authorisation. Verify the original collection and its date before approving it.</p>}
      {detail.status !== 'PENDING' && <p className="text-sm text-emerald-800 mt-3">Already reviewed · {detail.status} · Receipt {detail.receiptId}</p>}
      <div className="space-y-3 mt-4 text-sm">
        <label className="flex gap-2 items-start"><input className="accent-[#1E3A5F] mt-0.5 shrink-0" type="radio" name="review-decision" checked={decision === 'APPLY_WITH_EXCESS'} onChange={() => setDecision('APPLY_WITH_EXCESS')} />
          <span>I verified this is a separate collection. Apply current dues first, other chits next, and keep any remainder as member credit.
            {detail.originalAllocations?.length > 0 && <span className="block text-amber-800 mt-1">This decision replaces the original chit allocations with the reviewed distribution above.</span>}</span></label>
        <label className="flex gap-2 items-start"><input className="accent-[#1E3A5F] mt-0.5 shrink-0" type="radio" name="review-decision" checked={decision === 'LINK_DUPLICATE'} onChange={() => setDecision('LINK_DUPLICATE')} />
          <span>This is the same collection as an existing receipt. Link it without posting money again.</span></label>
        {decision === 'LINK_DUPLICATE' && <>
          <select aria-label="Original payment receipt" value={receiptId} onChange={(event) => setReceiptId(event.target.value)} className="w-full border border-gray-200 rounded-xl p-3">
            <option value="">Choose the matching original receipt</option>
            {matching.map((receipt) => <option key={receipt.id} value={receipt.id}>{money(receipt.totalAmount)} · {date(receipt.recordedAt ?? receipt.createdAt)} · {receipt.paymentReference ?? receipt.id}</option>)}
          </select>
          <input aria-label="Original receipt ID" value={receiptId} onChange={(event) => setReceiptId(event.target.value)} placeholder="Or enter an older original receipt ID" className="w-full border border-gray-200 rounded-xl p-3" />
        </>}
        <textarea aria-label="Review reason" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} placeholder="Explain what you verified and why" className="w-full border border-gray-200 rounded-xl p-3 min-h-24 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/20 focus:border-[#1E3A5F]" />
      </div>

    </>}
  </Modal>;
}
