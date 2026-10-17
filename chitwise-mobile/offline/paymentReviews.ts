import { refreshPostedCollection } from './financialRefresh';
import { useAuthStore } from '../store/authStore';
import { getStoredAccountScope } from './accountScope';
import { accountForScope } from './accountClient';
import { requestAsAccount } from './accountClient';
import { deferReviewPoll, getOperationsAwaitingReview, getRecoverablePayments, hasOfflineDatabase, updateOperation } from './database';

export async function loadOfflinePaymentReviews(scope: string, page = 0) {
  return (await requestAsAccount(scope, { method: 'GET', url: '/payments/offline/reviews', params: { page, size: 20 } })).data.data;
}
export async function getOfflinePaymentReview(scope: string, id: string) {
  return (await requestAsAccount(scope, { method: 'GET', url: `/payments/offline/reviews/${id}` })).data.data;
}
export async function getOfflinePaymentReviewMatches(scope: string, id: string, page: number) {
  return (await requestAsAccount(scope, { method: 'GET', url: `/payments/offline/reviews/${id}/matches`, params: { page, size: 10 } })).data.data;
}
export async function resolveOfflinePaymentReview(scope: string, id: string, decision: {
  decision: string; expectedBalanceVersion: string; reason: string; existingReceiptId?: string;
}) {
  return (await requestAsAccount(scope, { method: 'POST', url: `/payments/offline/reviews/${id}/resolve`, data: decision })).data.data;
}
export async function recordOfflineCollectionRefund(scope: string, id: string, refund: {
  amount: number; paymentMode: string; reference: string; refundedAt: string; reason: string; moneyReturned: boolean;
}) {
  return (await requestAsAccount(scope, { method: 'POST', url: `/payments/offline/reviews/${id}/refund`, data: refund })).data.data;
}
export async function refreshReviewedPayments(scope: string, force = false, deadline = Infinity, deliveryScope = scope) {
  let confirmed = 0;
  for (const operation of await getOperationsAwaitingReview(scope, force)) {
    if (Date.now() >= deadline) break;
    let unavailable = false;
    try {
      const owner = accountForScope(deliveryScope);
      if (deliveryScope !== scope && (owner?.role !== 'ADMIN' || owner.tenantId !== operation.tenantId)) throw new Error('Review belongs to another organisation');
      const review = await getOfflinePaymentReview(deliveryScope, operation.serverReviewId!);
      if ((review.status === 'REFUNDED' && review.refund) || review.status === 'CANCELLED') {
        await updateOperation(operation.operationId, scope, 'SUCCEEDED', { serverReceipt: {
          offlineReviewResolution: review.status, reviewId: review.id, refund: review.refund, reason: review.resolutionReason,
        } });
        confirmed++;
      } else if (['APPLIED', 'DUPLICATE'].includes(review.status) && review.receiptId) {
        const receipt = (await requestAsAccount(deliveryScope, { method: 'GET', url: `/payments/batches/${review.receiptId}` })).data.data;
        if (!receipt?.id) throw new Error('Reviewed receipt is not available yet');
        await updateOperation(operation.operationId, scope, 'SUCCEEDED', { serverReceiptId: receipt.id,
          serverReceipt: { ...receipt, offlineReviewResolution: review.status } });
        try { await refreshPostedCollection(deliveryScope, operation.payload, receipt); } catch {}
        confirmed++;
      }
    } catch (error: any) {
      const status = error?.response?.status;
      unavailable = !status || status === 401 || status >= 500 || [408, 429].includes(status);
    }
    finally { await deferReviewPoll(operation); }
    if (unavailable) break;
  }
  return confirmed;
}

export async function cancelOfflineCollection(scope: string, id: string, reason: string, noMoneyCollected: boolean) {
  return (await requestAsAccount(scope, { method: 'POST', url: `/payments/offline/reviews/${id}/cancel`, data: { reason, noMoneyCollected } })).data.data;
}

/** Current same-tenant admin may quarantine historical evidence, never silently post it. */
export async function recoverSavedCollections(adminScope: string) {
  const admin = accountForScope(adminScope);
  if (!admin?.sessionValid || admin.role !== 'ADMIN' || !admin.tenantId) throw new Error('An organisation admin must sign in to recover saved collections');
  let count = 0;
  for (const account of useAuthStore.getState().accounts.filter((a) => a.tenantId === admin.tenantId && a.authSource !== 'HUB')) {
    for (const scope of [...new Set([getStoredAccountScope(account), ...(account.retainedOfflineScopes ?? [])])]) {
      if (!await hasOfflineDatabase(scope)) continue;
      for (const operation of await getRecoverablePayments(scope)) {
        if (operation.tenantId !== admin.tenantId || !operation.payload.offlineAuthorization || operation.payload.localRecoveryRequired) continue;
        const result = (await requestAsAccount(adminScope, { method: 'POST', url: '/payments/offline/reviews/recover',
          headers: { 'X-Idempotency-Key': operation.operationId }, data: { originalActorId: operation.actorId, original: operation.payload } })).data.data;
        if (!result?.reviewId) throw new Error('Server did not confirm recovery; the original collection remains on this device');
        await updateOperation(operation.operationId, scope, 'CONFLICT', { serverReviewId: result.reviewId,
          errorMessage: 'Recovered for admin review. Original collection evidence is preserved.' });
        count++;
      }
      await refreshReviewedPayments(scope, true, Date.now() + 20_000, adminScope);
    }
  }
  return count;
}

export async function refreshRecoveredReviews(adminScope: string, deadline: number) {
  const admin = accountForScope(adminScope);
  if (admin?.role !== 'ADMIN' || !admin.sessionValid) return;
  for (const account of useAuthStore.getState().accounts.filter((a) => a.tenantId === admin.tenantId && a.authSource !== 'HUB')) {
    for (const scope of [...new Set([getStoredAccountScope(account), ...(account.retainedOfflineScopes ?? [])])]) {
      if (Date.now() >= deadline) return;
      if (scope !== adminScope && await hasOfflineDatabase(scope)) await refreshReviewedPayments(scope, false, deadline, adminScope);
    }
  }
}
