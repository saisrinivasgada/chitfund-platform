import { getMember, getChit } from '../services/api';
import { offlinePresentation } from '../../../shared/offline/presentation';
import { accountSyncSummary } from '../../../shared/offline/accountSyncSummary';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { CloudCheck, CloudOff, RefreshCw, Users, ArrowUpRight, ShieldCheck, AlertTriangle, Clock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import Modal from '../components/ui/Modal';
import Button from '../components/ui/Button';
import { accountScope, activeAccountScope, requestForAccount } from './accountClient';
import { canRecordOffline, cancelSavedPayment, savedPaymentActivity, syncSavedPayments } from './outbox';
import { readRow, readRows } from './storage';
import { loadPreparationState } from './preparation';
import OfflineCollectionReviews from './OfflineCollectionReviews';

const STATUS_LABELS = {
  QUEUED: 'Saved on this browser', SYNCING: 'Syncing', RETRYABLE_FAILURE: 'Will retry',
  PAUSED_ACCESS: 'Saved · access needed', AUTH_REQUIRED: 'Sign in to sync',
  CONFLICT: 'Review needed', FAILED: 'Review needed', SUCCEEDED: 'Synced',
};

export default function OfflineStatus({ connectionScreen = false }) {
  const auth = useAuth();
  const scope = !auth.isProxySession ? accountScope(auth.user, auth.tenantId) : null;
  const [account, setAccount] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [accountStatuses, setAccountStatuses] = useState({});
  const [syncingAccount, setSyncingAccount] = useState(null);
  const [activity, setActivity] = useState([]);
  const [online, setOnline] = useState(navigator.onLine);
  const [open, setOpen] = useState(null);
  const [selectedPaymentKey, setSelectedPaymentKey] = useState(null);
  const [cancellationReason, setCancellationReason] = useState('');
  const [noMoneyCollected, setNoMoneyCollected] = useState(false);
  const [notice, setNotice] = useState('');
  const [selectedReview, setSelectedReview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [cachedAt, setCachedAt] = useState(null);
  const [preparation, setPreparation] = useState(null);
  const [activityLimit, setActivityLimit] = useState(30);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const countQuery = useQuery({ queryKey: ['offline-review-count', scope], enabled: !!scope && auth.user?.role === 'ADMIN' && online,
    queryFn: () => requestForAccount(scope, '/payments/offline/reviews?page=0&size=1'), refetchInterval: online ? 30_000 : false, retry: false });
  const staffCountQuery = useQuery({ queryKey: ['offline-staff-review-count', scope], enabled: !!scope && auth.user?.role === 'ADMIN' && online,
    queryFn: () => requestForAccount(scope, '/payments/offline/staff-actions/reviews?page=0&size=1'), refetchInterval: online ? 30_000 : false, retry: false });
  const reviewCount = (countQuery.data?.totalElements ?? countQuery.data?.content?.length ?? 0) + (staffCountQuery.data?.totalElements ?? 0);
  useEffect(() => { setOpen(null); setSelectedReview(null); setSelectedPaymentKey(null); setNotice(''); }, [scope]);
  const openReview = (id = null) => { setSelectedReview(id); setOpen('reviews'); };

  const refresh = useCallback(async () => {
    if (!scope) return;
    const [current, all, entries, prepared, queues] = await Promise.all([readRow('accounts', scope), readRows('accounts'), savedPaymentActivity(scope), loadPreparationState(scope), readRows('outbox')]);
    if (activeAccountScope() !== scope) return;
    setAccount(current); setAccounts(all); setActivity(entries);
    setPreparation(prepared);
    const statuses = await Promise.all(all.map(async (saved) => {
      const owned = queues.filter((entry) => (entry.recoveryScope ?? entry.scope) === saved.scope);
      const counts = { pending: owned.filter((e) => !['SUCCEEDED', 'CANCELLED', 'CONFLICT', 'FAILED'].includes(e.status)).length,
        conflicts: owned.filter((e) => e.status === 'CONFLICT').length, failed: owned.filter((e) => e.status === 'FAILED').length,
        paused: owned.filter((e) => e.status === 'PAUSED_ACCESS').length, syncing: owned.filter((e) => e.status === 'SYNCING').length };
      return [saved.scope, { counts, preparation: await loadPreparationState(saved.scope).catch(() => null),
        lastSyncedAt: Math.max(0, ...owned.filter((e) => e.status === 'SUCCEEDED').map((e) => e.syncedAt ?? 0)) }];
    }));
    if (activeAccountScope() === scope) setAccountStatuses(Object.fromEntries(statuses));
  }, [scope]);

  useEffect(() => {
    let active = true;
    const update = () => { if (active) refresh().catch(() => {}); };
    const network = () => { setOnline(navigator.onLine); update(); };
    const cached = (event) => { if (event.detail.scope === scope) setCachedAt(event.detail.cachedAt); };
    const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('chitwise-offline');
    const preparationChannel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('chitwise-offline-preparation');
    if (preparationChannel) preparationChannel.onmessage = ({ data }) => {
      if (active && data.scope === scope && activeAccountScope() === scope) setPreparation(data.manifest);
    };
    if (channel) channel.onmessage = update;
    window.addEventListener('online', network); window.addEventListener('offline', network);
    window.addEventListener('chitwise:cached-read', cached);
    const timer = setInterval(update, 10_000);
    update();
    return () => {
      active = false; clearInterval(timer); channel?.close(); preparationChannel?.close();
      window.removeEventListener('online', network); window.removeEventListener('offline', network);
      window.removeEventListener('chitwise:cached-read', cached);
    };
  }, [refresh, scope]);

  const selectedPayment = activity.find((entry) => entry.key === selectedPaymentKey && (entry.recoveryScope ?? entry.scope) === scope);
  const selectedAllocations = selectedPayment?.payload?.allocations?.length ? selectedPayment.payload.allocations : selectedPayment?.payload?.chitId ? [{ chitId: selectedPayment.payload.chitId, amount: selectedPayment.payload.amount }] : [];
  const selectedMember = useQuery({ queryKey: ['saved-payment-member', scope, selectedPayment?.payload?.memberId],
    queryFn: () => getMember(selectedPayment.payload.memberId), enabled: !!scope && open === 'activity' && !!selectedPayment?.payload?.memberId, retry: false, staleTime: 60_000 });
  const selectedChits = useQueries({ queries: selectedAllocations.map((allocation) => ({
    queryKey: ['saved-payment-chit', scope, allocation.chitId], queryFn: () => getChit(allocation.chitId),
    enabled: !!scope && open === 'activity' && !!allocation.chitId, retry: false, staleTime: 60_000,
  })) });
  if (!scope) return null;
  const pending = activity.filter((entry) => !['SUCCEEDED', 'CANCELLED'].includes(entry.status));
  const needsReview = pending.some((entry) => ['CONFLICT', 'FAILED', 'PAUSED_ACCESS', 'AUTH_REQUIRED'].includes(entry.status));
  const { showSync: enabled, notSubscribed } = offlinePresentation(account?.offlineAccess, account?.tenant?.offlineEnabled);
  const canRecord = canRecordOffline(account?.offlineAccess, 'RECORD_PAYMENT');
  const color = needsReview ? 'border-amber-200 bg-amber-50 text-amber-900'
    : !online ? 'border-slate-200 bg-slate-50 text-slate-800' : 'border-emerald-100 bg-emerald-50/60 text-emerald-900';
  const title = !online ? 'Offline · showing saved data' : pending.length ? `${pending.length} payment${pending.length === 1 ? '' : 's'} saved on this browser`
    : enabled ? 'Offline access is enabled' : 'Accounts';
  const detail = needsReview ? 'Saved payments are preserved. Open activity to see what needs attention.'
    : !online && enabled && !canRecord && auth.user.role === 'ADMIN' ? 'New offline payments are paused. Connect to verify access; saved payments remain here.'
      : !online && !enabled ? 'Connect to continue. Offline access is not enabled for this organisation.'
        : pending.length ? 'They will sync when a connection is available, including after subscription expiry.'
          : cachedAt ? `Saved snapshot from ${new Date(cachedAt).toLocaleString()}` : 'Recorded payments remain saved until the server confirms them.';
  const preparationDetail = !enabled ? null : preparation?.status === 'ready'
    ? `Core data saved · ${new Date(preparation.lastCompleteAt).toLocaleString()}`
    : preparation ? `${preparation.lastCompleteAt ? 'Saved data available · ' : ''}${preparation.status === 'paused' || !online ? 'Download paused' : 'Preparing offline data'} · ${preparation.completed} chunks ${preparation.lastCompleteAt ? 'refreshed' : 'saved'}${preparation.total ? ` · ${preparation.detailsDone ?? 0}/${preparation.total} details` : ''}. Remaining downloads resume automatically.`
      : 'Preparing offline data when connected. Records not yet downloaded may be unavailable offline.';

  async function sync() {
    setBusy(true); setError('');
    try {
      await syncSavedPayments(); await refresh();
      if (activeAccountScope() === scope) await queryClient.invalidateQueries({ refetchType: 'active' });
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function switchAccount(target) {
    setBusy(true); setError('');
    try {
      await auth.switchToSavedAccount(target.scope); setOpen(null);
      navigate(target.user.role === 'MEMBER' ? '/member' : '/dashboard');
    }
    catch (err) { setError(err.message ?? 'Sign in to this account again to continue'); }
    finally { setBusy(false); }
  }

  return <>
    {enabled ? <div className={`mb-5 rounded-2xl border px-4 py-3 flex flex-wrap items-center gap-3 ${color}`} role="status">
      {online ? <CloudCheck size={21} className="shrink-0" /> : <CloudOff size={21} className="shrink-0" />}
      <div className="min-w-0 flex-1"><p className="text-sm font-semibold">{title}</p>
        {(enabled || pending.length > 0 || !online) && <p className="text-xs mt-0.5 opacity-80">{detail}</p>}
        {preparationDetail && <p className="text-xs mt-1 opacity-80">{preparationDetail}</p>}</div>
      {enabled && pending.length > 0 && <Button size="xs" variant="ghost" onClick={() => { setError(''); setSelectedPaymentKey(null); setNotice(''); setOpen('activity'); }}>{needsReview ? <AlertTriangle size={15} /> : pending.some((entry) => entry.status === 'SYNCING') ? <RefreshCw size={15} className="animate-spin" /> : <Clock size={15} />}{pending.length} saved payment{pending.length === 1 ? '' : 's'}{needsReview ? ' · needs attention' : ' · waiting to sync'} <ArrowUpRight size={13} /></Button>}
      {auth.user.role === 'ADMIN' && reviewCount > 0 && <Button size="xs" variant="ghost" disabled={!online} onClick={() => openReview()}>Collection reviews ({reviewCount})</Button>}
      <Button size="xs" variant="ghost" onClick={() => { setError(''); setOpen('accounts'); }}><Users size={14} /> Accounts</Button>
    </div> : <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
      {!online && !connectionScreen && <p role="status" className="mr-auto text-sm text-slate-700">No internet connection. {notSubscribed ? 'Your organisation hasn’t subscribed to Offline access & sync. Connect to continue.' : 'Connect to verify offline access for this account.'}</p>}
      {auth.user.role === 'ADMIN' && reviewCount > 0 && <Button size="xs" variant="ghost" disabled={!online} onClick={() => openReview()}>Collection reviews ({reviewCount})</Button>}
      <Button size="xs" variant="ghost" onClick={() => { setError(''); setOpen('accounts'); }}><Users size={14} /> Accounts</Button>
    </div>}
    {enabled && open === 'activity' && <Modal title={selectedPayment ? 'Saved payment details' : 'Saved payment activity'} onClose={() => setOpen(null)} size="md">
      <p className="text-sm text-gray-500 mb-4">Saved payments stay here until the server confirms them. Synced payments appear in History.</p>
      {notice && <p role="status" className="mb-4 rounded-xl bg-slate-100 p-3 text-sm text-slate-700">{notice}</p>}
      {selectedPayment ? <div className="space-y-4">
        <button className="text-sm font-semibold text-[#1E3A5F]" onClick={() => setSelectedPaymentKey(null)}>← Back to saved payments</button>
        <p className="text-3xl font-bold text-[#1E3A5F]">₹{Number(selectedPayment.payload?.amount ?? 0).toLocaleString('en-IN')}</p>
        <p className="font-semibold text-[#1E3A5F]">{selectedMember.data?.fullName ?? selectedMember.data?.name ?? 'Member collection'}</p>
        <p className="text-sm text-slate-600">{selectedPayment.payload?.paymentMode?.replaceAll('_', ' ')} · {new Date(selectedPayment.createdAt).toLocaleString()}</p>
        {selectedPayment.payload?.paymentReference && <p className="text-sm text-slate-600">Reference · {selectedPayment.payload.paymentReference}</p>}
        {selectedPayment.payload?.notes && <p className="text-sm text-slate-600">{selectedPayment.payload.notes}</p>}
        <h3 className="text-sm font-semibold text-[#1E3A5F]">Requested allocations</h3>
        {selectedAllocations.map((allocation, index) => <div key={`${allocation.chitId}:${index}`} className="flex justify-between border-b border-slate-100 py-2 text-sm"><span>{selectedChits[index]?.data?.name ?? `Selected chit ${index + 1}`}</span><strong>₹{Number(allocation.amount).toLocaleString('en-IN')}</strong></div>)}
        {selectedPayment.errorMessage && <p className="text-sm text-amber-800">{selectedPayment.errorMessage}</p>}
        {selectedPayment.reviewId && <Button disabled={!online} onClick={() => openReview(selectedPayment.reviewId)}>Review transaction</Button>}
        {auth.user.role === 'ADMIN' && selectedPayment.payload && !selectedPayment.reviewId && !selectedPayment.receipt && !selectedPayment.cancellation && selectedPayment.status !== 'SYNCING' && <div className="rounded-xl border border-slate-200 p-4 space-y-3">
          <h3 className="font-semibold text-[#1E3A5F]">Cancel mistaken entry</h3>
          <p className="text-xs leading-5 text-slate-500">Only cancel if no money was collected. Received payments use Void in History. A completed refund needs a refund record.</p>
          <label className="block text-sm text-slate-700">Cancellation reason<textarea aria-label="Cancellation reason" maxLength={500} value={cancellationReason} onChange={(event) => setCancellationReason(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 p-3" /></label>
          <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={noMoneyCollected} onChange={(event) => setNoMoneyCollected(event.target.checked)} />I confirm no money was collected</label>
          <Button variant="danger" disabled={!noMoneyCollected || cancellationReason.trim().length < 5} loading={busy} onClick={async () => {
            const owner = scope; setBusy(true); setError('');
            try {
              const result = await cancelSavedPayment(owner, selectedPayment.key, cancellationReason, noMoneyCollected);
              if (activeAccountScope() !== owner) return;
              setNotice(result?.status === 'SUCCEEDED' ? 'The server already received this payment. Open History to view its receipt or use Void.' : result?.status === 'CANCELLED' ? 'Entry cancelled. Its requested allocations will not be applied.' : 'Cancellation is saved and waiting for server verification.');
              await refresh(); await queryClient.invalidateQueries({ refetchType: 'active' });
            } catch (failure) { if (activeAccountScope() === owner) setError(failure.message); }
            finally { setBusy(false); }
          }}>Cancel payment</Button>
        </div>}
      </div> : <div className="space-y-3 max-h-80 overflow-y-auto">
        {!activity.length && <div className="rounded-xl bg-emerald-50 p-5 text-sm text-emerald-800 flex items-center gap-2"><ShieldCheck size={18} /> No payments waiting to sync.</div>}
        {activity.slice(0, activityLimit).map((entry) => <div key={entry.key} role="button" tabIndex={0} onClick={() => { setSelectedPaymentKey(entry.key); setCancellationReason(''); setNoMoneyCollected(false); setError(''); }} onKeyDown={(event) => { if (['Enter', ' '].includes(event.key)) { event.preventDefault(); setSelectedPaymentKey(entry.key); setCancellationReason(''); setNoMoneyCollected(false); setError(''); } }} className="rounded-xl border border-gray-200 p-3">
          <div className="flex justify-between gap-3"><p className="font-semibold text-gray-900">{entry.payload ? `₹${Number(entry.payload.amount).toLocaleString('en-IN')}` : 'Saved payment'}
            <span className="ml-2 text-xs text-gray-500 font-normal">{entry.payload?.paymentMode?.replaceAll('_', ' ')}</span></p>
            <span className={`text-xs font-medium ${entry.status === 'SUCCEEDED' ? 'text-emerald-700' : 'text-amber-700'}`}>{entry.reviewResolution === 'CANCELLED' ? 'Cancelled · kept in history' : entry.reviewResolution === 'REFUNDED' ? 'Refund recorded' : entry.reviewResolution === 'DUPLICATE' ? 'Linked to original receipt' : STATUS_LABELS[entry.status] ?? 'Saved'}</span></div>
          <p className="text-xs text-gray-500 mt-1">Recorded {new Date(entry.createdAt).toLocaleString()}</p>
          {entry.errorMessage && <p className="text-xs text-amber-800 mt-2">{entry.errorMessage}</p>}
          {entry.reviewId && entry.status === 'CONFLICT' && <p className="mt-2 text-xs font-semibold text-amber-800">View details & review →</p>}
        </div>)}
        {activity.length > activityLimit && <Button variant="ghost" onClick={() => setActivityLimit(activityLimit + 30)}>Show more saved entries</Button>}
      </div>}
      {auth.user.role === 'ADMIN' && <Button variant="ghost" disabled={!online} onClick={() => openReview()}>Recover saved collections on this browser</Button>}
      {error && <p className="text-sm text-red-700 mt-3">{error}</p>}
      <div className="flex justify-end gap-2 mt-5"><Button variant="ghost" onClick={() => setOpen(null)}>Close</Button>
        <Button disabled={!online} loading={busy} onClick={sync}><RefreshCw size={14} /> Sync now</Button></div>
    </Modal>}
    {open === 'reviews' && <OfflineCollectionReviews key={scope} scope={scope} initialReviewId={selectedReview} onClose={() => { setOpen(null); refresh().catch(() => {}); }} />}
    {open === 'accounts' && <Modal title="Your saved accounts" onClose={() => setOpen(null)} size="md">
      <p className="text-sm text-gray-500 mb-4">Choose the organisation you want to use. Switching accounts keeps each account separate.</p>
      <div className="space-y-2">
        {accounts.map((saved) => {
          const status = accountSyncSummary({ ...accountStatuses[saved.scope], sessionValid: saved.sessionValid, online, syncing: syncingAccount === saved.scope });
          return <div key={saved.scope} className={`rounded-xl border p-4 ${saved.scope === scope ? 'border-[#1E3A5F] bg-slate-50' : 'border-gray-200'}`}>
            <button disabled={busy || saved.scope === scope} onClick={() => switchAccount(saved)} className="w-full text-left flex justify-between gap-3 disabled:opacity-60">
              <div><p className="text-sm font-semibold text-gray-900">{saved.tenant.tenantName ?? 'Organisation'}</p><p className="text-xs text-gray-500 mt-1">{saved.user.fullName} · {saved.user.role}</p></div>
              <span className="text-xs text-gray-500">{saved.scope === scope ? 'Current' : saved.sessionValid ? 'Switch' : 'Sign in again'}</span>
            </button>
            {offlinePresentation(saved.offlineAccess, saved.tenant?.offlineEnabled).showSync && <div className="mt-3 border-t border-gray-200 pt-3 flex items-center gap-3">
              {status.state === 'ready' ? <CloudCheck size={18} className="text-emerald-700 shrink-0" /> : !online ? <CloudOff size={18} className="text-amber-700 shrink-0" /> : <RefreshCw size={18} className={`shrink-0 ${status.state === 'syncing' ? 'animate-spin text-blue-700' : 'text-amber-700'}`} />}
              <div className="flex-1"><p className="text-xs font-semibold text-gray-900">{status.label}</p>{status.detail && <p className="text-xs text-gray-500 mt-1">{status.detail}</p>}
                {!!accountStatuses[saved.scope]?.lastSyncedAt && <p className="text-xs text-gray-400 mt-1">Last collection sync · {new Date(accountStatuses[saved.scope].lastSyncedAt).toLocaleString()}</p>}
              </div>
              <Button size="xs" variant="ghost" loading={syncingAccount === saved.scope} disabled={!online || !!syncingAccount}
                onClick={async () => { if (!saved.sessionValid) { await switchAccount(saved); return; } setSyncingAccount(saved.scope); setError('');
                  try { await syncSavedPayments({ scope: saved.scope }); await refresh(); if (activeAccountScope() === saved.scope) await queryClient.invalidateQueries({ refetchType: 'active' }); }
                  catch (err) { setError(err.message); } finally { setSyncingAccount(null); } }}>
                {saved.sessionValid ? 'Sync now' : 'Sign in'}
              </Button>
            </div>}
          </div>;
        })}
      </div>
      {auth.user.role === 'ADMIN' && accounts.some(saved => {
        const counts = accountStatuses[saved.scope]?.counts;
        return saved.tenant?.tenantId === auth.tenantId && counts && counts.pending + counts.conflicts + counts.failed > 0;
      }) && <Button variant="ghost" disabled={!online || busy} onClick={() => openReview()}>Recover earlier collections</Button>}
      {error && <p className="text-sm text-red-700 mt-3">{error}</p>}
      <div className="flex justify-end gap-2 mt-5"><Button variant="ghost" onClick={() => setOpen(null)}>Close</Button>
        <Button disabled={!online} onClick={() => { auth.startAccountLogin(); navigate('/login'); }}>Sign in to another account</Button></div>
    </Modal>}
  </>;
}
