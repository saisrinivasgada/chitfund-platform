import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { CloudCheck, CloudOff, RefreshCw, Users, ArrowUpRight, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import Modal from '../components/ui/Modal';
import Button from '../components/ui/Button';
import { accountScope, activeAccountScope } from './accountClient';
import { canRecordOffline, savedPaymentActivity, syncSavedPayments } from './outbox';
import { readRow, readRows } from './storage';
import { loadPreparationState } from './preparation';
import OfflineCollectionReviews from './OfflineCollectionReviews';

const STATUS_LABELS = {
  QUEUED: 'Saved on this browser', SYNCING: 'Syncing', RETRYABLE_FAILURE: 'Will retry',
  PAUSED_ACCESS: 'Saved · access needed', AUTH_REQUIRED: 'Sign in to sync',
  CONFLICT: 'Review needed', FAILED: 'Review needed', SUCCEEDED: 'Synced',
};

export default function OfflineStatus() {
  const auth = useAuth();
  const scope = !auth.isProxySession ? accountScope(auth.user, auth.tenantId) : null;
  const [account, setAccount] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [activity, setActivity] = useState([]);
  const [online, setOnline] = useState(navigator.onLine);
  const [open, setOpen] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [cachedAt, setCachedAt] = useState(null);
  const [preparation, setPreparation] = useState(null);
  const [activityLimit, setActivityLimit] = useState(30);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const refresh = useCallback(async () => {
    if (!scope) return;
    const [current, all, entries, prepared] = await Promise.all([readRow('accounts', scope), readRows('accounts'), savedPaymentActivity(scope, true), loadPreparationState(scope)]);
    if (activeAccountScope() !== scope) return;
    setAccount(current); setAccounts(all); setActivity(entries);
    setPreparation(prepared);
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

  if (!scope) return null;
  const pending = activity.filter((entry) => entry.status !== 'SUCCEEDED');
  const needsReview = pending.some((entry) => ['CONFLICT', 'FAILED', 'PAUSED_ACCESS', 'AUTH_REQUIRED'].includes(entry.status));
  const enabled = account?.offlineAccess?.enabled;
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
    <div className={`mb-5 rounded-2xl border px-4 py-3 flex flex-wrap items-center gap-3 ${color}`} role="status">
      {online ? <CloudCheck size={21} className="shrink-0" /> : <CloudOff size={21} className="shrink-0" />}
      <div className="min-w-0 flex-1"><p className="text-sm font-semibold">{title}</p>
        {(enabled || pending.length > 0 || !online) && <p className="text-xs mt-0.5 opacity-80">{detail}</p>}
        {preparationDetail && <p className="text-xs mt-1 opacity-80">{preparationDetail}</p>}</div>
      {(enabled || activity.length > 0) && <Button size="xs" variant="ghost" onClick={() => { setError(''); setOpen('activity'); }}>Payment activity <ArrowUpRight size={13} /></Button>}
      {auth.user.role === 'ADMIN' && <Button size="xs" variant="ghost" disabled={!online} onClick={() => setOpen('reviews')}>Collection reviews</Button>}
      <Button size="xs" variant="ghost" onClick={() => { setError(''); setOpen('accounts'); }}><Users size={14} /> Accounts</Button>
    </div>
    {open === 'activity' && <Modal title="Saved payment activity" onClose={() => setOpen(null)} size="md">
      <p className="text-sm text-gray-500 mb-4">Saved payments stay on this browser until the server confirms them. Expiry stops new offline payments; it does not erase saved ones.</p>
      <div className="space-y-3 max-h-80 overflow-y-auto">
        {!activity.length && <div className="rounded-xl bg-emerald-50 p-5 text-sm text-emerald-800 flex items-center gap-2"><ShieldCheck size={18} /> No payments waiting to sync.</div>}
        {activity.slice(0, activityLimit).map((entry) => <div key={entry.key} className="rounded-xl border border-gray-200 p-3">
          <div className="flex justify-between gap-3"><p className="font-semibold text-gray-900">{entry.payload ? `₹${Number(entry.payload.amount).toLocaleString('en-IN')}` : 'Saved payment'}
            <span className="ml-2 text-xs text-gray-500 font-normal">{entry.payload?.paymentMode?.replaceAll('_', ' ')}</span></p>
            <span className={`text-xs font-medium ${entry.status === 'SUCCEEDED' ? 'text-emerald-700' : 'text-amber-700'}`}>{entry.reviewResolution === 'DUPLICATE' ? 'Linked to original receipt' : STATUS_LABELS[entry.status] ?? 'Saved'}</span></div>
          <p className="text-xs text-gray-500 mt-1">Recorded {new Date(entry.createdAt).toLocaleString()}</p>
          {entry.errorMessage && <p className="text-xs text-amber-800 mt-2">{entry.errorMessage}</p>}
          {entry.reviewId && entry.status === 'CONFLICT' && <Button size="xs" variant="ghost" disabled={!online} onClick={() => setOpen('reviews')}>Review saved collection</Button>}
        </div>)}
        {activity.length > activityLimit && <Button variant="ghost" onClick={() => setActivityLimit(activityLimit + 30)}>Show more saved entries</Button>}
      </div>
      {error && <p className="text-sm text-red-700 mt-3">{error}</p>}
      <div className="flex justify-end gap-2 mt-5"><Button variant="ghost" onClick={() => setOpen(null)}>Close</Button>
        <Button disabled={!online} loading={busy} onClick={sync}><RefreshCw size={14} /> Sync now</Button></div>
    </Modal>}
    {open === 'reviews' && <OfflineCollectionReviews key={scope} scope={scope} onClose={() => { setOpen(null); refresh().catch(() => {}); }} />}
    {open === 'accounts' && <Modal title="Your saved accounts" onClose={() => setOpen(null)} size="md">
      <p className="text-sm text-gray-500 mb-4">Each organisation keeps its own saved data and payments. Switching accounts does not stop another signed-in account syncing.</p>
      <div className="space-y-2">
        {accounts.map((saved) => <button key={saved.scope} disabled={busy || !online || saved.scope === scope}
          onClick={() => switchAccount(saved)} className={`w-full rounded-xl border p-4 text-left flex justify-between gap-3 disabled:opacity-60 ${saved.scope === scope ? 'border-[#1E3A5F] bg-slate-50' : 'border-gray-200 hover:bg-gray-50'}`}>
          <div><p className="text-sm font-semibold text-gray-900">{saved.tenant.tenantName ?? 'Organisation'}</p><p className="text-xs text-gray-500 mt-1">{saved.user.fullName} · {saved.user.role}</p></div>
          <span className="text-xs text-gray-500">{saved.scope === scope ? 'Current' : saved.sessionValid ? 'Switch' : 'Sign in again'}</span>
        </button>)}
      </div>
      {error && <p className="text-sm text-red-700 mt-3">{error}</p>}
      <div className="flex justify-end gap-2 mt-5"><Button variant="ghost" onClick={() => setOpen(null)}>Close</Button>
        <Button disabled={!online} onClick={() => { auth.startAccountLogin(); navigate('/login'); }}>Sign in to another account</Button></div>
    </Modal>}
  </>;
}
