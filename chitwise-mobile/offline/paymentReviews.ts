import { requestAsAccount } from './accountClient';
import { deferReviewPoll, getOperationsAwaitingReview, updateOperation } from './database';

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
export async function refreshReviewedPayments(scope: string, force = false, deadline = Infinity) {
  let confirmed = 0;
  for (const operation of await getOperationsAwaitingReview(scope, force)) {
    if (Date.now() >= deadline) break;
    let unavailable = false;
    try {
      const review = await getOfflinePaymentReview(scope, operation.serverReviewId!);
      if (['APPLIED', 'DUPLICATE'].includes(review.status) && review.receiptId) {
        const receipt = (await requestAsAccount(scope, { method: 'GET', url: `/payments/batches/${review.receiptId}` })).data.data;
        if (!receipt?.id) throw new Error('Reviewed receipt is not available yet');
        await updateOperation(operation.operationId, scope, 'SUCCEEDED', { serverReceiptId: receipt.id,
          serverReceipt: { ...receipt, offlineReviewResolution: review.status } });
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
