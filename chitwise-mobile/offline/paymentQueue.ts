import axios from 'axios';
import * as Crypto from 'expo-crypto';
import NetInfo from '@react-native-community/netinfo';
import { recordPayment } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { requireOrganizationScope } from './accountScope';
import {
  getOperation,
  getSyncCounts,
  insertOperation,
  setLastSyncedAt,
  updateOperation,
} from './database';
import type { OfflinePaymentResult, QueuedOperation } from './types';
import { useSyncStore } from '../store/syncStore';
import { accountForScope, requestAsAccount } from './accountClient';
import { refreshOfflineAccess, useOfflineAccessStore } from './access';
import { canRecordOffline, requireOfflineRecording } from './accessPolicy';
import { claimOperation } from './database';

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

  const attempts = operation.attempts + 1;

  try {
    if (!await claimOperation(operation)) return { kind: 'retryable', error: new Error('Payment is already being synchronized') };
    const response = await requestAsAccount(operation.accountScope, {
      method: 'POST', url: '/payments', data: operation.payload,
      headers: { 'X-Idempotency-Key': operation.operationId },
    });
    const result = response.data?.data ?? response.data;
    if (!result?.id) throw new Error('Server did not confirm a payment receipt; retrying safely');
    await updateOperation(operation.operationId, operation.accountScope, 'SUCCEEDED', {
      attempts,
      serverReceiptId: result?.id ? String(result.id) : null,
    });
    return { kind: 'succeeded', result };
  } catch (error) {
    const details = errorDetails(error);
    if (details.status === 401 || (error as any)?.requiresLogin) {
      await updateOperation(operation.operationId, operation.accountScope, 'RETRYABLE_FAILURE', {
        attempts,
        nextAttemptAt: Date.now() + 60_000,
        errorCode: details.code,
        errorMessage: 'Login required before this payment can sync',
      });
      return { kind: 'auth-required', error };
    }
    if (details.status === 403 || ['PLAN_002', 'ADD_ON_REQUIRED'].includes(details.code)) {
      await updateOperation(operation.operationId, operation.accountScope, 'PAUSED_ACCESS', {
        attempts, nextAttemptAt: Date.now() + 5 * 60_000, errorCode: details.code,
        errorMessage: 'Saved payment needs access restored or review. It is preserved on this device.',
      });
      return { kind: 'access-required', error };
    }
    if (details.status === 409) {
      await updateOperation(operation.operationId, operation.accountScope, 'CONFLICT', {
        attempts,
        errorCode: details.code,
        errorMessage: details.message,
      });
      return { kind: 'conflict', error };
    }
    if (details.status != null && details.status >= 400 && details.status < 500 && details.status !== 408 && details.status !== 429) {
      await updateOperation(operation.operationId, operation.accountScope, 'PERMANENT_FAILURE', {
        attempts,
        errorCode: details.code,
        errorMessage: details.message,
      });
      return { kind: 'failed', error };
    }

    await updateOperation(operation.operationId, operation.accountScope, 'RETRYABLE_FAILURE', {
      attempts,
      nextAttemptAt: Date.now() + retryDelay(attempts),
      errorCode: details.code,
      errorMessage: details.message,
    });
    return { kind: 'retryable', error };
  }
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
  const network = await NetInfo.fetch();
  const reachable = network.isConnected === true && network.isInternetReachable !== false;
  let access = useOfflineAccessStore.getState().accounts[account.scope];
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
      await insertOperation(operation);
      inserted = true;
      break;
    } catch (error) {
      const isCollision = error instanceof Error && error.message.includes('already associated with different');
      if (isCollision && !callerKey) {
        // UUID collision with a different payload — generate fresh ID and retry
        operationId = Crypto.randomUUID();
        continue;
      }
      // SQLCipher unavailable (Expo Go) or unrecoverable error
      if (reachable && !isCollision) return sendForAccount(account.scope, payload, operationId);
      throw error;
    }
  }

  if (!inserted) {
    // All retries exhausted (should never happen in practice)
    if (reachable) return sendForAccount(account.scope, payload, Crypto.randomUUID());
    throw new Error('The payment could not be saved securely on this device');
  }

  const insertCounts = await getSyncCounts(account.scope);
  useSyncStore.getState().setStateForScope(account.scope, {
    pendingCount: insertCounts.pending,
    conflictCount: insertCounts.conflicts,
    failedCount: insertCounts.failed,
    status: reachable ? 'pending' : 'offline',
  });
  if (!reachable) return pendingResult(operationId, payload);

  const stored = await getOperation(operationId, account.scope);
  if (!stored) throw new Error('The payment could not be saved securely on this device');
  let processed: ProcessOperationResult;
  try {
    processed = await processPaymentOperation(stored);
  } catch {
    return pendingResult(operationId, payload);
  }
  const counts = await getSyncCounts(account.scope);
  if (processed.kind === 'succeeded' && counts.pending === 0 && counts.conflicts === 0 && counts.failed === 0) {
    await setLastSyncedAt(account.scope, Date.now());
  }
  useSyncStore.getState().setStateForScope(account.scope, {
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
