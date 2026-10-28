import { refreshPostedCollection } from './financialRefresh';
import axios from 'axios';
import * as Crypto from 'expo-crypto';
import NetInfo from '@react-native-community/netinfo';
import { recordPayment } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { requireOrganizationScope } from './accountScope';
import {
  getOperation,
  hasOfflineDatabase,
  getSyncCounts,
  insertOperation,
  offlineRecordingEpoch,
  setLastSyncedAt,
  withDeliveryClaim, isDeliveryClaimLost,
} from './database';
import type { OfflinePaymentResult, QueuedOperation } from './types';
import { useSyncStore } from '../store/syncStore';
import { accountForScope, requestAsAccount } from './accountClient';
import { refreshOfflineAccess, offlineAccessForScope } from './access';
import { canRecordOffline, requireOfflineRecording } from './accessPolicy';

export interface RecordPaymentPayload {
  chitId: string;
  memberId: string;
  amount: number;
  paymentMode: 'CASH' | 'UPI' | 'BANK_TRANSFER' | 'CHEQUE' | 'CREDIT' | string;
  notes?: string;
  paymentReference?: string;
  drawNumber?: number;
  idempotencyKey?: string;
  recordedAt?: string;
  offlineAuthorization?: string;
  allocations?: Array<{ chitId: string; amount: number }>;
}

async function sendForAccount(scope: string, payload: RecordPaymentPayload, operationId: string) {
  const { idempotencyKey: _unused, ...data } = payload;
  const response = await requestAsAccount(scope, {
    method: 'POST', url: '/payments', data, headers: { 'X-Idempotency-Key': operationId },
  });
  return response.data?.data ?? response.data;
}

export type ProcessOperationResult =
  | { kind: 'succeeded'; result: any }
  | { kind: 'retryable'; error: unknown }
  | { kind: 'auth-required'; error: unknown }
  | { kind: 'access-required'; error: unknown }
  | { kind: 'conflict'; error: unknown }
  | { kind: 'failed'; error: unknown };

function canonicalize(value: any): any {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

async function payloadHash(payload: RecordPaymentPayload): Promise<string> {
  return Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    JSON.stringify(canonicalize(payload)),
  );
}

function normalizePayload(input: RecordPaymentPayload): RecordPaymentPayload {
  const reference = input.paymentReference?.trim().toUpperCase() || undefined;
  const payload: RecordPaymentPayload = {
    chitId: input.chitId,
    memberId: input.memberId,
    amount: Number(input.amount),
    paymentMode: input.paymentMode,
    notes: input.notes?.trim() || undefined,
    paymentReference: reference,
    recordedAt: input.recordedAt ?? new Date().toISOString(),
  };
  if (input.drawNumber != null) payload.drawNumber = input.drawNumber;
  if (input.allocations?.length) {
    payload.allocations = input.allocations
      .map((allocation) => ({ chitId: allocation.chitId, amount: Number(allocation.amount) }))
      .sort((a, b) => a.chitId.localeCompare(b.chitId));
  }
  return payload;
}

function validatePayload(payload: RecordPaymentPayload) {
  if (!payload.chitId || !payload.memberId) throw new Error('Member and chit are required');
  if (!Number.isFinite(payload.amount) || payload.amount < 0) throw new Error('Enter a valid payment amount');
  if (payload.paymentMode !== 'CREDIT' && payload.amount <= 0) throw new Error('Payment amount must be greater than zero');
  if (['UPI', 'BANK_TRANSFER', 'CHEQUE'].includes(payload.paymentMode) && !payload.paymentReference) {
    throw new Error('Enter the UPI, bank, or cheque reference number');
  }
}

function errorDetails(error: unknown): { status?: number; code: string; message: string } {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    return {
      status,
      code: String(error.response?.data?.errorCode ?? error.code ?? `HTTP_${status ?? 'NETWORK'}`),
      message: String(error.response?.data?.message ?? error.message ?? 'Synchronization failed').slice(0, 300),
    };
  }
  return { code: 'LOCAL_ERROR', message: error instanceof Error ? error.message.slice(0, 300) : 'Synchronization failed' };
}

function retryDelay(attempts: number): number {
  const base = Math.min(5 * 60_000, 2 ** Math.max(0, attempts - 1) * 5_000);
  return base + Math.floor(Math.random() * 2_000);
}

export async function processPaymentOperation(operation: QueuedOperation<any>): Promise<ProcessOperationResult> {
  const owner = accountForScope(operation.accountScope);
  if (!owner?.sessionValid || owner.userId !== operation.actorId || owner.tenantId !== operation.tenantId) {
    return { kind: 'auth-required', error: new Error('Sign in to the account that recorded this payment') };
  }

  return (await withDeliveryClaim(operation, async (claimed, complete): Promise<ProcessOperationResult> => {
    operation = claimed;
    const attempts = operation.attempts;

    if (operation.payload?.localRecoveryRequired) {
      await complete('PERMANENT_FAILURE', {
        errorCode: 'LOCAL_RECOVERY_REQUIRED', errorMessage: 'Saved record needs local recovery. Its original data is preserved.',
      });
      return { kind: 'failed', error: new Error('Saved record needs local recovery') };
    }

    try {
      const cancellation = operation.serverReceipt?.cancellationRequest;
      const response = await requestAsAccount(operation.accountScope, {
        method: 'POST', url: cancellation ? '/payments/offline/reviews/cancel-unsynced' : operation.payload.offlineAuthorization ? '/payments/offline/record' : '/payments/offline/reviews/legacy', data: cancellation ? { originalActorId: operation.actorId, original: operation.payload, cancellation: { reason: cancellation.reason, noMoneyCollected: cancellation.noMoneyCollected } } : operation.payload,
        headers: { 'X-Idempotency-Key': operation.operationId },
      });
      const result = response.data?.data ?? response.data;
      if (cancellation && (result?.status === 'CANCELLED' || (result?.status === 'REFUNDED' && result?.refund))) {
        await complete('CANCELLED', {
          attempts, serverReviewId: result.id, serverReceipt: { offlineReviewResolution: result.status, reviewId: result.id, reason: result.resolutionReason, refund: result.refund },
        });
        return { kind: 'succeeded', result };
      }
      const confirmed = cancellation && result?.status === 'RECEIPT_EXISTS' ? result.receipt : result;
      if (!confirmed?.id) throw new Error('Server did not confirm a payment receipt; retrying safely');
      await complete('SUCCEEDED', {
        attempts,
        serverReceiptId: String(confirmed.id),
        serverReceipt: confirmed,
      });
      try { await refreshPostedCollection(operation.accountScope, operation.payload, confirmed); } catch { /* Receipt is confirmed; preparation retries stale reads separately. */ }
      return { kind: 'succeeded', result };
    } catch (error) {
      if (isDeliveryClaimLost(error)) throw error;
      const details = errorDetails(error);
      if (details.status === 401 || (error as any)?.requiresLogin) {
        await complete('RETRYABLE_FAILURE', {
          attempts,
          nextAttemptAt: Date.now() + 60_000,
          errorCode: details.code,
          errorMessage: 'Login required before this payment can sync',
        });
        return { kind: 'auth-required', error };
      }
      if (details.status === 403 || ['PLAN_002', 'ADD_ON_REQUIRED'].includes(details.code)) {
        await complete('PAUSED_ACCESS', {
          attempts, nextAttemptAt: Date.now() + 5 * 60_000, errorCode: details.code,
          errorMessage: 'Saved payment needs access restored or review. It is preserved on this device.',
        });
        return { kind: 'access-required', error };
      }
      if (details.status === 409) {
        await complete('CONFLICT', {
          attempts,
          errorCode: details.code,
          errorMessage: details.message,
          serverReviewId: axios.isAxiosError(error) ? error.response?.data?.data?.reviewId : undefined,
        });
        return { kind: 'conflict', error };
      }
      if (details.status != null && details.status >= 400 && details.status < 500 && details.status !== 408 && details.status !== 429) {
        await complete('PERMANENT_FAILURE', {
          attempts,
          errorCode: details.code,
          errorMessage: details.message,
        });
        return { kind: 'failed', error };
      }

      await complete('RETRYABLE_FAILURE', {
        attempts,
        nextAttemptAt: Date.now() + retryDelay(attempts),
        errorCode: details.code,
        errorMessage: details.message,
      });
      return { kind: 'retryable', error };
    }
  })) ?? { kind: 'retryable', error: new Error('Payment sync was superseded by another attempt') };
}

function pendingResult(operationId: string, payload: RecordPaymentPayload): OfflinePaymentResult {
  return {
    id: `local:${operationId}`,
    localOperationId: operationId,
    offlineQueued: true,
    status: 'PENDING_SYNC',
    chitId: payload.chitId,
    memberId: payload.memberId,
    totalAmount: payload.amount,
    paymentMode: payload.paymentMode,
    paymentReference: payload.paymentReference,
    createdAt: new Date().toISOString(),
  };
}

async function deliverSavedPayment(operation: QueuedOperation<RecordPaymentPayload>, reachable: boolean) {
  const operationId = operation.operationId;
  const payload = operation.payload;
  const insertCounts = await getSyncCounts(operation.accountScope);
  useSyncStore.getState().setStateForScope(operation.accountScope, {
    pendingCount: insertCounts.pending,
    conflictCount: insertCounts.conflicts,
    failedCount: insertCounts.failed,
    status: reachable ? 'syncing' : 'offline',
  });
  if (!reachable) return pendingResult(operationId, payload);

  let processed: ProcessOperationResult;
  try {
    processed = await processPaymentOperation(operation);
  } catch {
    return pendingResult(operationId, payload);
  }
  const counts = await getSyncCounts(operation.accountScope);
  if (processed.kind === 'succeeded' && counts.pending === 0 && counts.conflicts === 0 && counts.failed === 0) {
    await setLastSyncedAt(operation.accountScope, Date.now());
  }
  useSyncStore.getState().setStateForScope(operation.accountScope, {
    pendingCount: counts.pending,
    conflictCount: counts.conflicts,
    failedCount: counts.failed,
    status: processed.kind === 'succeeded'
      ? (counts.conflicts || counts.failed ? 'conflict' : counts.pending ? 'pending' : 'synced')
      : processed.kind === 'conflict' || processed.kind === 'failed'
        ? 'conflict'
        : processed.kind === 'auth-required'
          ? 'auth-required'
          : processed.kind === 'access-required' ? 'access-required'
          : 'pending',
  });
  if (processed.kind === 'succeeded') return processed.result;
  if (processed.kind === 'retryable' || processed.kind === 'auth-required' || processed.kind === 'access-required') {
    return pendingResult(operationId, payload);
  }
  throw processed.error;
}

export async function recordPaymentOfflineCapable(input: RecordPaymentPayload): Promise<any | OfflinePaymentResult> {
  const user = useAuthStore.getState().user;
  if (user?.role !== 'ADMIN' || input.paymentMode === 'CREDIT') {
    // Manager/staff payment APIs have different authorization and accounting
    // semantics. Credit application also depends on current server balances.
    // Do not queue either from a potentially stale offline snapshot.
    // Still attach an idempotency key so network-level retries don't create duplicates.
    const idempotencyKey = input.idempotencyKey ?? Crypto.randomUUID();
    return recordPayment({ ...input, idempotencyKey });
  }

  const account = requireOrganizationScope(user);
  const epochScope = account.scope;
  const sessionEpoch = await offlineRecordingEpoch(epochScope);
  const network = await NetInfo.fetch();
  const reachable = network.isConnected === true && network.isInternetReachable !== false;
  if (input.idempotencyKey && await hasOfflineDatabase(account.scope)) {
    const prior = await getOperation(input.idempotencyKey, account.scope) as QueuedOperation<RecordPaymentPayload & { localRecoveryRequired?: boolean }> | null;
    if (prior) {
      if (prior.action !== 'RECORD_PAYMENT' || prior.payload?.localRecoveryRequired) throw new Error('This saved collection needs review before it can be retried');
      const business = (value: RecordPaymentPayload) => {
        const { recordedAt: _time, offlineAuthorization: _grant, ...fields } = normalizePayload(value);
        return fields;
      };
      if (await payloadHash(business(input)) !== await payloadHash(business(prior.payload))) {
        throw new Error('This saved collection has different details. Review it before changing the amount.');
      }
      if (prior.status === 'SUCCEEDED') {
        if (['REFUNDED', 'CANCELLED'].includes(prior.serverReceipt?.offlineReviewResolution)) throw new Error('This collection was closed after review. Its original record remains in saved activity.');
        if (!prior.serverReceipt?.id && !prior.serverReceiptId) throw new Error('Server confirmation needs verification. The saved collection remains preserved.');
        return prior.serverReceipt ?? { ...pendingResult(prior.operationId, prior.payload),
          id: prior.serverReceiptId, offlineQueued: false, status: 'COMPLETED' };
      }
      if (prior.status === 'CANCELLED' || prior.serverReceipt?.cancellationRequest) throw new Error('This collection was cancelled or cancellation is awaiting server verification. Check History or saved payments.');
      if (['CONFLICT', 'PERMANENT_FAILURE'].includes(prior.status)) throw new Error(prior.lastErrorMessage ?? 'This saved collection needs review');
      return deliverSavedPayment(prior as QueuedOperation<RecordPaymentPayload>, reachable);
    }
  }
  let access = offlineAccessForScope(account.scope);
  if (reachable && !canRecordOffline(access, 'RECORD_PAYMENT')) {
    try { access = await refreshOfflineAccess(account.scope); } catch { /* Existing valid grants survive transport failure. */ }
  }
  if (!canRecordOffline(access, 'RECORD_PAYMENT')) {
    if (reachable) return sendForAccount(account.scope, input, input.idempotencyKey ?? Crypto.randomUUID());
    requireOfflineRecording(access, 'RECORD_PAYMENT');
  }
  const recordedAt = Date.now();
  const grant = requireOfflineRecording(access, 'RECORD_PAYMENT', recordedAt);
  if (!accountForScope(account.scope)?.sessionValid) throw new Error('Sign in again before recording this payment');
  const payload = normalizePayload(input);
  payload.offlineAuthorization = grant.token;
  payload.recordedAt = new Date(access!.serverTime + (recordedAt - access!.checkedAt)).toISOString();
  validatePayload(payload);
  const hash = await payloadHash(payload);

  // Try inserting with the provided or generated operationId. In the astronomically
  // unlikely case that a self-generated UUID collides with a different existing
  // operation, generate a fresh one and retry (up to 3 times). Caller-supplied
  // idempotency keys are never retried — they are intentional reuse.
  const callerKey = input.idempotencyKey;
  let operationId = callerKey || Crypto.randomUUID();
  let inserted = false;
  for (let attempt = 0; attempt < 3; attempt++) {
    const now = Date.now();
    const operation: QueuedOperation<RecordPaymentPayload> = {
      operationId,
      accountScope: account.scope,
      tenantId: account.tenantId,
      actorId: account.actorId,
      action: 'RECORD_PAYMENT',
      entityType: 'PAYMENT',
      entityId: payload.memberId,
      payload,
      payloadHash: hash,
      status: 'QUEUED',
      attempts: 0,
      nextAttemptAt: now,
      createdAt: now,
      updatedAt: now,
    };
    try {
      if (operation.accountScope !== epochScope) throw new Error('Account changed before the payment could be saved');
      await insertOperation(operation,sessionEpoch);
      inserted = true;
      break;
    } catch (error) {
      const isCollision = error instanceof Error && error.message.includes('already associated with different');
      if (isCollision && !callerKey) {
        // UUID collision with a different payload — generate fresh ID and retry
        operationId = Crypto.randomUUID();
        continue;
      }
      // A signed offline operation must be durably saved before sending. A
      // fallback with freshly minted time/grant would break immutable retries.
      throw error;
    }
  }

  if (!inserted) {
    // All retries exhausted (should never happen in practice)
    if (reachable) return sendForAccount(account.scope, payload, Crypto.randomUUID());
    throw new Error('The payment could not be saved securely on this device');
  }

  const stored = await getOperation(operationId, account.scope);
  if (!stored) throw new Error('The payment could not be saved securely on this device');
  return deliverSavedPayment(stored as QueuedOperation<RecordPaymentPayload>, reachable);
}
