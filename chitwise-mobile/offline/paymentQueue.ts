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
  allocations?: Array<{ chitId: string; amount: number }>;
}

export type ProcessOperationResult =
  | { kind: 'succeeded'; result: any }
  | { kind: 'retryable'; error: unknown }
  | { kind: 'auth-required'; error: unknown }
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
  const currentUser = useAuthStore.getState().user;
  const current = requireOrganizationScope(currentUser);
  if (current.scope !== operation.accountScope || current.actorId !== operation.actorId) {
    return { kind: 'auth-required', error: new Error('Switch back to the account that recorded this payment') };
  }

  const attempts = operation.attempts + 1;
  await updateOperation(operation.operationId, 'SYNCING', { attempts });

  try {
    const result = await recordPayment({
      ...(operation.payload as RecordPaymentPayload),
      idempotencyKey: operation.operationId,
    });
    await updateOperation(operation.operationId, 'SUCCEEDED', {
      attempts,
      serverReceiptId: result?.id ? String(result.id) : null,
    });
    return { kind: 'succeeded', result };
  } catch (error) {
    const details = errorDetails(error);
    if (details.status === 401) {
      await updateOperation(operation.operationId, 'RETRYABLE_FAILURE', {
        attempts,
        nextAttemptAt: Date.now() + 60_000,
        errorCode: details.code,
        errorMessage: 'Login required before this payment can sync',
      });
      return { kind: 'auth-required', error };
    }
    if (details.status === 409) {
      await updateOperation(operation.operationId, 'CONFLICT', {
        attempts,
        errorCode: details.code,
        errorMessage: details.message,
      });
      return { kind: 'conflict', error };
    }
    if (details.status != null && details.status >= 400 && details.status < 500 && details.status !== 408 && details.status !== 429) {
      await updateOperation(operation.operationId, 'PERMANENT_FAILURE', {
        attempts,
        errorCode: details.code,
        errorMessage: details.message,
      });
      return { kind: 'failed', error };
    }

    await updateOperation(operation.operationId, 'RETRYABLE_FAILURE', {
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
    return recordPayment(input);
  }

  const account = requireOrganizationScope(user);
  const payload = normalizePayload(input);
  validatePayload(payload);
  const operationId = input.idempotencyKey || Crypto.randomUUID();
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
    payloadHash: await payloadHash(payload),
    status: 'QUEUED',
    attempts: 0,
    nextAttemptAt: now,
    createdAt: now,
    updatedAt: now,
  };
  const network = await NetInfo.fetch();
  const reachable = network.isConnected === true && network.isInternetReachable !== false;
  try {
    await insertOperation(operation);
    const counts = await getSyncCounts(account.scope);
    useSyncStore.getState().setStateForScope(account.scope, {
      pendingCount: counts.pending,
      conflictCount: counts.conflicts,
      failedCount: counts.failed,
      status: reachable ? 'pending' : 'offline',
    });
  } catch (error) {
    // Expo Go cannot load SQLCipher. Preserve normal online behavior there,
    // but never pretend an offline payment was saved when it was not.
    if (reachable) return recordPayment({ ...payload, idempotencyKey: operationId });
    throw error;
  }
  if (!reachable) return pendingResult(operationId, payload);

  const stored = await getOperation(operationId);
  if (!stored) throw new Error('The payment could not be saved securely on this device');
  const processed = await processPaymentOperation(stored);
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
          : 'pending',
  });
  if (processed.kind === 'succeeded') return processed.result;
  if (processed.kind === 'retryable' || processed.kind === 'auth-required') {
    return pendingResult(operationId, payload);
  }
  throw processed.error;
}
