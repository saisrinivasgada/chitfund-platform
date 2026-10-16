import { runAccountTasks } from '../../../shared/offline/scheduling';
import { accountScope, requestForAccount } from './accountClient';
import { claimOutbox, mutateRow, readRow, readRows, seal, unseal } from './storage';

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
    if (prior.businessHash !== businessHash) throw new Error('This saved payment has different details. Review it before changing the amount.');
    return prior.status === 'SUCCEEDED' && prior.receipt ? unseal(scope, prior.receipt) : pending(prior, payload);
  }
  const now = Date.now();
  const access = account.offlineAccess;
  if (!canRecordOffline(access, 'RECORD_PAYMENT', now)) throw new Error(recordingPauseMessage(access, now));
  payload.recordedAt = new Date(access.serverTime + now - access.checkedAt).toISOString();
  payload.offlineAuthorization = access.grant.token;
  const encrypted = await seal(scope, payload);
  // Recheck logout after encryption; never revive a removed/locked account.
  const current = await readRow('accounts', scope);
  if (!current?.sessionValid || current.generation !== account.generation) throw new Error('Account session changed before the payment was saved');
  const entry = await mutateRow('outbox', key, (existing) => {
    if (existing && existing.businessHash !== businessHash) throw new Error('Payment operation already has different details');
    return existing ?? { key, scope, operationId, action: 'RECORD_PAYMENT', encrypted, businessHash,
      status: 'QUEUED', createdAt: now, attempts: 0, nextAttemptAt: now };
  });
  notifyOfflineChange(scope);
  if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistration().then((registration) => registration?.sync?.register('chitwise-payments')).catch(() => {});
  }
  return pending(entry, payload);
}

function pending(entry, payload) {
  return { id: `local:${entry.operationId}`, localOperationId: entry.operationId, offlineQueued: true,
    status: 'PENDING_SYNC', memberId: payload.memberId, chitId: payload.chitId,
    totalAmount: payload.amount, paymentMode: payload.paymentMode };
}

export async function syncSavedPayments({ deadline = Date.now() + 60_000 } = {}) {
  const accounts = await readRows('accounts');
  const operations = (await readRows('outbox')).sort((a, b) => a.createdAt - b.createdAt);
  await runAccountTasks(accounts.filter((account) => account.sessionValid), async (account) => {
    const ready = operations.filter((entry) => entry.scope === account.scope && !['SUCCEEDED', 'FAILED'].includes(entry.status));
    let attempted = 0;
    for (const entry of ready) {
      if (Date.now() >= deadline || attempted >= 25) break;
      if (entry.status === 'CONFLICT' && entry.reviewId) {
        attempted++;
        try {
          const review = await requestForAccount(account.scope, `/payments/offline/reviews/${entry.reviewId}`);
          if (['APPLIED', 'DUPLICATE'].includes(review.status) && review.receiptId) {
            const receipt = await requestForAccount(account.scope, `/payments/batches/${review.receiptId}`);
            if (!receipt?.id) throw new Error('Reviewed payment receipt is not available yet');
            const encryptedReceipt = await seal(account.scope, receipt);
            await mutateRow('outbox', entry.key, (current) => current?.reviewId === entry.reviewId && current.status === 'CONFLICT'
              ? { ...current, status: 'SUCCEEDED', receipt: encryptedReceipt, syncedAt: Date.now(),
                reviewResolution: review.status, errorMessage: null } : undefined);
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
        const receipt = await requestForAccount(account.scope, payload.offlineAuthorization ? '/payments' : '/payments/offline/reviews/legacy', {
          method: 'POST', body: payload, headers: { 'X-Idempotency-Key': claimed.operationId },
        });
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
      notifyOfflineChange(account.scope);
      if (pauseAccount) break;
    }
  }, { deadline });
}

export async function savedPaymentActivity(scope, includeSynced = false) {
  return Promise.all((await readRows('outbox')).filter((entry) => entry.scope === scope && (includeSynced || entry.status !== 'SUCCEEDED'))
    .sort((a, b) => Number(a.status === 'SUCCEEDED') - Number(b.status === 'SUCCEEDED') || b.createdAt - a.createdAt)
    .map(async (entry) => {
      try { return { ...entry, payload: await unseal(scope, entry.encrypted) }; }
      catch { return { ...entry, payload: null, errorMessage: 'Saved payment needs local recovery. Its encrypted record is preserved.' }; }
    }));
}
