import { getOperation, requestPaymentCancellation } from './database';
import type { QueuedOperation } from './types';

/** Wait for the current sender to release its claim; never override an ambiguous delivery. */
export async function cancelSavedPayment(
  scope: string, operationId: string, reason: string, actor: string,
  isCurrentAccount: () => boolean,
): Promise<QueuedOperation> {
  if (reason.trim().length < 5 || reason.trim().length > 500) throw new Error('Explain the mistaken entry in 5–500 characters');
  // A send can include a token refresh and one retry. Waiting is bounded, and
  // timing out leaves the original entry intact rather than promising a cancel.
  const deadline = Date.now() + 65_000;
  const current = async () => {
    if (!isCurrentAccount()) throw new Error('Account changed. Open this payment in its original account to continue.');
    const row = await getOperation(operationId, scope);
    if (!isCurrentAccount()) throw new Error('Account changed. Open this payment in its original account to continue.');
    if (!row || row.accountScope !== scope || row.actorId !== actor || row.action !== 'RECORD_PAYMENT') {
      throw new Error('This saved payment is no longer available in this account.');
    }
    return row;
  };
  const resolved = (row: QueuedOperation) => row.status === 'CANCELLED' || row.status === 'SUCCEEDED'
    || !!row.serverReviewId || !!row.serverReceiptId || !!row.serverReceipt?.cancellationRequest;
  while (true) {
    const row = await current();
    if (resolved(row)) return row;
    if (row.status !== 'SYNCING') {
      try {
        await requestPaymentCancellation(scope, operationId, reason, actor);
        return await current();
      } catch (error) {
        // Delivery/recovery may claim between the read and the atomic cancel.
        // Only that race is retried; validation/session errors still surface.
        const latest = await current();
        if (resolved(latest)) return latest;
        if (latest.status !== 'SYNCING' && latest.attempts <= row.attempts) throw error;
      }
    }
    if (Date.now() >= deadline) {
      throw new Error('Sync is still checking this payment. Cancellation has not been saved. Your payment is preserved; try again when sync finishes.');
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 250));
  }
}
