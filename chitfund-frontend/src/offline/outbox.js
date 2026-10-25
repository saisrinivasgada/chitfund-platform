import { refreshFinancialSnapshots } from '../../../shared/offline/financialRefresh';
import { saveCachedResponse } from './cache';
import { runAccountTasks } from '../../../shared/offline/scheduling';
import { accountScope, requestForAccount } from './accountClient';
import { claimOutbox, claimOutboxRecovery, mutateRow, readRow, readRows, requestOutboxCancellation, saveOutboxForAccount, seal, unseal, writeRow } from './storage';

import { canRecordOffline, recordingPauseMessage } from '../../../shared/offline/accessPolicy';
export { canRecordOffline } from '../../../shared/offline/accessPolicy';

export function notifyOfflineChange(scope) {
  if (typeof BroadcastChannel === 'undefined') return;
  const channel = new BroadcastChannel('chitwise-offline');
  channel.postMessage({ scope });
  channel.close();
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}

async function hash(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(canonical(value))));
  return Array.from(new Uint8Array(digest), (n) => n.toString(16).padStart(2, '0')).join('');
}

export async function queuePayment(scope, input) {
  const account = await readRow('accounts', scope);
  if (!account?.sessionValid || accountScope(account.user, account.tenant.tenantId) !== scope) throw new Error('Sign in again to record this payment');
  if (account.user.role !== 'ADMIN' || input.paymentMode === 'CREDIT') throw new Error('This payment needs an internet connection');
  const payload = {
    chitId: input.chitId, memberId: input.memberId, amount: Number(input.amount), paymentMode: input.paymentMode,
    notes: input.notes?.trim() || undefined, paymentReference: input.paymentReference?.trim().toUpperCase() || undefined,
    allocations: input.allocations?.length ? [...input.allocations].sort((a, b) => a.chitId.localeCompare(b.chitId)) : undefined,
  };
  if (!payload.memberId || !payload.chitId || !Number.isFinite(payload.amount) || payload.amount <= 0) throw new Error('Enter valid member, chit and payment details');
  if (['UPI', 'BANK_TRANSFER', 'CHEQUE'].includes(payload.paymentMode) && !payload.paymentReference) throw new Error('Enter the payment reference number');
  const operationId = input.idempotencyKey ?? crypto.randomUUID();
  const key = `${scope}:${operationId}`;
  const businessHash = await hash(payload);
  const prior = await readRow('outbox', key);
  if (prior) {
    if (prior.status === 'CANCELLED' || prior.cancellation || ['REFUNDED', 'CANCELLED'].includes(prior.reviewResolution)) throw new Error(`This saved collection was ${prior.reviewResolution === 'REFUNDED' ? 'refunded' : 'cancelled'}. Its original record remains in payment activity.`);
    if (['CONFLICT', 'FAILED'].includes(prior.status)) throw new Error(prior.errorMessage ?? 'This saved collection needs admin review. Its original record is preserved.');
    if (prior.businessHash !== businessHash) throw new Error('This saved payment has different details. Review it before changing the amount.');
    return prior.status === 'SUCCEEDED' && prior.receipt ? unseal(scope, prior.receipt) : pending(prior, payload);
  }
  const now = Date.now();
  const access = account.offlineAccess;
  if (!canRecordOffline(access, 'RECORD_PAYMENT', now)) throw new Error(recordingPauseMessage(access, now));
  payload.recordedAt = new Date(access.serverTime + now - access.checkedAt).toISOString();
  payload.offlineAuthorization = access.grant.token;
  const encrypted = await seal(scope, payload);
  const entry = await saveOutboxForAccount(account, { key, scope, operationId, action: 'RECORD_PAYMENT', encrypted, businessHash,
    status: 'QUEUED', createdAt: now, attempts: 0, nextAttemptAt: now });
  notifyOfflineChange(scope);
  if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistration().then((registration) => registration?.sync?.register('chitwise-payments')).catch(() => {});
  }
  return pending(entry, payload);
}

export async function cancelSavedPayment(scope, key, reason, noMoneyCollected) {
  if (!noMoneyCollected || reason?.trim().length < 5 || reason?.trim().length > 500) throw new Error('Confirm no money was collected and explain the mistaken entry in 5–500 characters');
  const evidence = await seal(scope, { reason: reason.trim(), noMoneyCollected: true, requestedAt: new Date().toISOString() });
  await requestOutboxCancellation(scope, key, evidence);
  notifyOfflineChange(scope);
  if (navigator.onLine) await syncSavedPayments({ scope });
  return readRow('outbox', key);
}

function pending(entry, payload) {
  return { id: `local:${entry.operationId}`, localOperationId: entry.operationId, offlineQueued: true,
    status: 'PENDING_SYNC', memberId: payload.memberId, chitId: payload.chitId,
    totalAmount: payload.amount, paymentMode: payload.paymentMode };
}

// Join a delivery already running in this browser so callers do not report a
// completed sync while startup is still holding the operation's lease.
const activeAccountSyncs = new Map();

export async function syncSavedPayments({ deadline = Date.now() + 60_000, scope: requestedScope } = {}) {
  const accounts = await readRows('accounts');
  await runAccountTasks(accounts.filter((account) => account.sessionValid && (!requestedScope || account.scope === requestedScope)), async (account) => {
    const running = activeAccountSyncs.get(account.scope);
    if (running) return running;
    const task = (async () => {
    const operations = (await readRows('outbox')).sort((a, b) => a.createdAt - b.createdAt);
    const ready = operations.filter((entry) => (entry.recoveryScope ?? entry.scope) === account.scope && !['SUCCEEDED', 'CANCELLED', 'FAILED'].includes(entry.status));
    let attempted = 0;
    for (const entry of ready) {
      if (Date.now() >= deadline || attempted >= 25) break;
      if (entry.status === 'CONFLICT' && entry.reviewId) {
        attempted++;
        try {
          const review = await requestForAccount(account.scope, `/payments/offline/reviews/${entry.reviewId}`);
          if ((review.status === 'REFUNDED' && review.refund) || review.status === 'CANCELLED') {
            const evidence = await seal(entry.scope, { offlineReviewResolution: review.status, reviewId: review.id, refund: review.refund, reason: review.resolutionReason });
            await mutateRow('outbox', entry.key, (current) => current?.reviewId === entry.reviewId && current.status === 'CONFLICT'
              ? { ...current, status: 'SUCCEEDED', receipt: evidence, syncedAt: Date.now(), reviewResolution: review.status, errorMessage: null } : undefined);
            notifyOfflineChange(entry.scope);
          } else if (['APPLIED', 'DUPLICATE'].includes(review.status) && review.receiptId) {
            const receipt = await requestForAccount(account.scope, `/payments/batches/${review.receiptId}`);
            if (!receipt?.id) throw new Error('Reviewed payment receipt is not available yet');
            const encryptedReceipt = await seal(entry.scope, receipt);
            await mutateRow('outbox', entry.key, (current) => current?.reviewId === entry.reviewId && current.status === 'CONFLICT'
              ? { ...current, status: 'SUCCEEDED', receipt: encryptedReceipt, syncedAt: Date.now(),
                reviewResolution: review.status, errorMessage: null } : undefined);
            try { await refreshPostedCollection(account.scope, await unseal(entry.scope, entry.encrypted), receipt); } catch { /* A confirmed payment survives a failed snapshot refresh. */ }
            notifyOfflineChange(account.scope);
          }
        } catch (error) {
          // A slow or unavailable server should not hold up every saved review.
          if (!error.status || error.status === 401 || error.status >= 500 || [408, 429].includes(error.status)) break;
        }
        continue;
      }
      const claimed = await claimOutbox(entry.key);
      if (!claimed) continue;
      attempted++;
      let pauseAccount = false;
      try {
        const payload = await unseal(account.scope, claimed.encrypted);
        const cancellation = claimed.cancellation ? await unseal(claimed.scope, claimed.cancellation) : null;
        const result = await requestForAccount(account.scope, cancellation ? '/payments/offline/reviews/cancel-unsynced' : payload.offlineAuthorization ? '/payments/offline/record' : '/payments/offline/reviews/legacy', {
          method: 'POST', body: cancellation ? { originalActorId: account.user.id, original: payload, cancellation: { reason: cancellation.reason, noMoneyCollected: cancellation.noMoneyCollected } } : payload, headers: { 'X-Idempotency-Key': claimed.operationId },
        });
        if (cancellation && (result?.status === 'CANCELLED' || (result?.status === 'REFUNDED' && result.refund))) {
          const evidence = await seal(claimed.scope, { offlineReviewResolution: result.status, reviewId: result.id, reason: result.resolutionReason, refund: result.refund });
          await mutateRow('outbox', claimed.key, (current) => current?.leaseId === claimed.leaseId
            ? { ...current, status: 'CANCELLED', reviewId: result.id, receipt: evidence, reviewResolution: result.status, syncedAt: Date.now(), errorMessage: null } : undefined);
          notifyOfflineChange(account.scope); continue;
        }
        const receipt = cancellation && result?.status === 'RECEIPT_EXISTS' ? result.receipt : result;
        if (!receipt?.id) throw new Error('Server did not confirm a payment receipt; retrying safely');
        const encryptedReceipt = await seal(account.scope, receipt);
        await mutateRow('outbox', claimed.key, (current) => current?.leaseId === claimed.leaseId
          ? { ...current, status: 'SUCCEEDED', receipt: encryptedReceipt, syncedAt: Date.now(), errorMessage: null } : undefined);
      } catch (error) {
        const status = error.status;
        const paused = status === 403 || ['PLAN_002', 'ADD_ON_REQUIRED'].includes(error.errorCode);
        const outcome = status === 409 ? 'CONFLICT' : paused ? 'PAUSED_ACCESS'
          : status === 401 ? 'AUTH_REQUIRED' : status >= 400 && status < 500 && ![408, 429].includes(status) ? 'FAILED' : 'RETRYABLE_FAILURE';
        await mutateRow('outbox', claimed.key, (current) => current?.leaseId === claimed.leaseId
          ? { ...current, status: outcome,
            reviewId: error.reviewId ?? current.reviewId,
            nextAttemptAt: Date.now() + (paused ? 300_000 : Math.min(300_000, 2 ** Math.min(claimed.attempts, 6) * 5_000)),
            errorMessage: String(error.message ?? 'Sync will retry').slice(0, 300) } : undefined);
        pauseAccount = ['AUTH_REQUIRED', 'RETRYABLE_FAILURE', 'PAUSED_ACCESS'].includes(outcome);
      }
      if ((await readRow('outbox', claimed.key))?.status === 'SUCCEEDED') {
        try { await refreshPostedCollection(account.scope, await unseal(claimed.scope, claimed.encrypted), await unseal(claimed.scope, (await readRow('outbox', claimed.key)).receipt)); } catch { /* A confirmed payment survives a failed snapshot refresh. */ }
      }
      notifyOfflineChange(account.scope);
      if (pauseAccount) break;
    }
    })();
    activeAccountSyncs.set(account.scope, task);
    try { await task; }
    finally { if (activeAccountSyncs.get(account.scope) === task) activeAccountSyncs.delete(account.scope); }
  }, { deadline });
}

export async function savedPaymentActivity(scope, includeSynced = false) {
  return Promise.all((await readRows('outbox')).filter((entry) => (entry.scope === scope || entry.recoveryScope === scope) && (includeSynced || !['SUCCEEDED', 'CANCELLED'].includes(entry.status)))
    .sort((a, b) => Number(a.status === 'SUCCEEDED') - Number(b.status === 'SUCCEEDED') || b.createdAt - a.createdAt)
    .map(async (entry) => {
      try { return { ...entry, payload: await unseal(entry.scope, entry.encrypted) }; }
      catch { return { ...entry, payload: null, errorMessage: 'Saved payment needs local recovery. Its encrypted record is preserved.' }; }
    }));
}

export async function recoverSavedCollections(adminScope) {
  const admin = await readRow('accounts', adminScope);
  if (!admin?.sessionValid || admin.user.role !== 'ADMIN') throw new Error('Sign in as an organisation admin to recover saved collections');
  const accounts = await readRows('accounts');
  const owners = new Map(accounts.filter((a) => a.tenant.tenantId === admin.tenant.tenantId).map((a) => [a.scope, a]));
  let count = 0;
  for (const entry of (await readRows('outbox')).filter((e) => owners.has(e.scope) && !e.reviewId
      && !e.cancellation && !e.receipt && !['SUCCEEDED', 'CANCELLED', 'SYNCING'].includes(e.status)
      && !['CANCELLED', 'REFUNDED'].includes(e.reviewResolution)).slice(0, 25)) {
    const claim = await claimOutboxRecovery(entry.key, adminScope);
    if (!claim) continue;
    const claimed = claim.entry;
    let recovered = false;
    try {
      const payload = await unseal(claimed.scope, claimed.encrypted);
      if (!payload.offlineAuthorization) continue;
      const owner = owners.get(claimed.scope);
      const result = await requestForAccount(adminScope, '/payments/offline/reviews/recover', {
        method: 'POST', headers: { 'X-Idempotency-Key': claimed.operationId }, body: { originalActorId: owner.user.id, original: payload },
      });
      if (!result?.reviewId) throw new Error('Server did not confirm recovery. The original collection remains on this browser');
      recovered = !!await mutateRow('outbox', claimed.key, (current) => current?.leaseId === claimed.leaseId
          && current.status === 'SYNCING' && !current.cancellation
        ? { ...current, status: 'CONFLICT', reviewId: result.reviewId, recoveryScope: adminScope,
          leaseUntil: 0, errorMessage: 'Recovered for admin review. The original collection remains preserved.' } : undefined);
      if (recovered) { notifyOfflineChange(claimed.scope); notifyOfflineChange(adminScope); count++; }
    } finally {
      if (!recovered) await mutateRow('outbox', claimed.key, (current) => current?.leaseId === claimed.leaseId && current.status === 'SYNCING'
        ? { ...current, status: claim.previousStatus, leaseUntil: 0 } : undefined);
    }
  }
  await syncSavedPayments();
  return count;
}

async function refreshPostedCollection(scope, original, receipt) {
  if (receipt?.id) await writeRow('datasets', { key: `${scope}:receipt-overlay:${await hash(receipt.id)}`, scope,
    encrypted: await seal(scope, receipt), savedAt: Date.now() });
  await mutateRow('preparation', scope, (prior) => prior ? { ...prior, financialDirtyAt: Date.now() } : undefined);
  await refreshFinancialSnapshots({ request: async (path, params) => ({ success: true, data: await requestForAccount(scope,
    path + (Object.keys(params).length ? '?' + new URLSearchParams(params) : '')) }),
    saveResponse: (path, params, data) => saveCachedResponse(scope, { method: 'GET', url: path, params }, data),
  }, original, receipt);
}
