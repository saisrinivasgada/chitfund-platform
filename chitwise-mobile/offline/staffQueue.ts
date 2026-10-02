import axios from 'axios';
import * as Crypto from 'expo-crypto';
import NetInfo from '@react-native-community/netinfo';
import { markPickedUp, partiallyCollectCashRequest } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { requireOrganizationScope } from './accountScope';
import {
  getOperation,
  getSyncCounts,
  insertOperation,
  setLastSyncedAt,
  updateOperation,
} from './database';
import type { QueuedOperation } from './types';
import type { ProcessOperationResult } from './paymentQueue';
import { useSyncStore } from '../store/syncStore';

export interface MarkPickupPayload {
  requestId: string;
}

export interface PartialCollectPayload {
  requestId: string;
  collectedAmount: number;
}

function errorDetails(error: unknown): { status?: number; code: string; message: string } {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    return {
      status,
      code: String(error.response?.data?.errorCode ?? error.code ?? `HTTP_${status ?? 'NETWORK'}`),
      message: String(error.response?.data?.message ?? error.message ?? 'Sync failed').slice(0, 300),
    };
  }
  return { code: 'LOCAL_ERROR', message: error instanceof Error ? error.message.slice(0, 300) : 'Sync failed' };
}

function retryDelay(attempts: number): number {
  const base = Math.min(5 * 60_000, 2 ** Math.max(0, attempts - 1) * 5_000);
  return base + Math.floor(Math.random() * 2_000);
}

export async function processStaffOperation(operation: QueuedOperation<any>): Promise<ProcessOperationResult> {
  const currentUser = useAuthStore.getState().user;
  const current = requireOrganizationScope(currentUser);
  if (current.scope !== operation.accountScope || current.actorId !== operation.actorId) {
    return { kind: 'auth-required', error: new Error('Switch back to the account that recorded this action') };
  }

  const attempts = operation.attempts + 1;
  try {
    await updateOperation(operation.operationId, operation.accountScope, 'SYNCING', { attempts });

    let result: any;
    if (operation.action === 'MARK_PICKUP') {
      result = await markPickedUp((operation.payload as MarkPickupPayload).requestId);
    } else {
      const p = operation.payload as PartialCollectPayload;
      result = await partiallyCollectCashRequest(p.requestId, p.collectedAmount);
    }

    await updateOperation(operation.operationId, operation.accountScope, 'SUCCEEDED', {
      attempts,
      serverReceiptId: result?.id ? String(result.id) : null,
    });
    return { kind: 'succeeded', result };
  } catch (error) {
    const details = errorDetails(error);
    if (details.status === 401) {
      await updateOperation(operation.operationId, operation.accountScope, 'RETRYABLE_FAILURE', {
        attempts,
        nextAttemptAt: Date.now() + 60_000,
        errorCode: details.code,
        errorMessage: 'Login required before this action can sync',
      });
      return { kind: 'auth-required', error };
    }
    if (details.status === 409) {
      // Server already has this state (e.g. already PICKED_UP from a previous sync attempt)
      // treat as success rather than a conflict — the outcome is what staff intended
      await updateOperation(operation.operationId, operation.accountScope, 'SUCCEEDED', {
        attempts,
        errorCode: details.code,
        errorMessage: 'Already applied on server',
      });
      return { kind: 'succeeded', result: null };
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

async function queueStaffAction(
  action: 'MARK_PICKUP' | 'PARTIAL_COLLECT',
  requestId: string,
  payload: MarkPickupPayload | PartialCollectPayload,
  onlineExec: () => Promise<any>,
): Promise<{ offlineQueued: boolean; result?: any }> {
  const user = useAuthStore.getState().user;
  const account = requireOrganizationScope(user);

  // Deterministic operation ID — prevents duplicate queue entries if staff taps twice offline
  const operationId = `${action}-${requestId}`;
  const payloadStr = JSON.stringify(payload);
  const hash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, payloadStr);
  const network = await NetInfo.fetch();
  const reachable = network.isConnected === true;

  const now = Date.now();
  const operation: QueuedOperation<any> = {
    operationId,
    accountScope: account.scope,
    tenantId: account.tenantId,
    actorId: account.actorId,
    action,
    entityType: 'CASH_REQUEST',
    entityId: requestId,
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
  } catch {
    // SQLCipher unavailable (Expo Go) — fall through to direct call
    return { offlineQueued: false, result: await onlineExec() };
  }

  const counts = await getSyncCounts(account.scope);
  useSyncStore.getState().setStateForScope(account.scope, {
    pendingCount: counts.pending,
    conflictCount: counts.conflicts,
    failedCount: counts.failed,
    status: reachable ? 'pending' : 'offline',
  });

  if (!reachable) return { offlineQueued: true };

  const stored = await getOperation(operationId, account.scope);
  if (!stored) return { offlineQueued: false, result: await onlineExec() };

  let processed: ProcessOperationResult;
  try {
    processed = await processStaffOperation(stored);
  } catch {
    return { offlineQueued: true };
  }

  const afterCounts = await getSyncCounts(account.scope);
  if (processed.kind === 'succeeded' && afterCounts.pending === 0 && afterCounts.conflicts === 0 && afterCounts.failed === 0) {
    await setLastSyncedAt(account.scope, Date.now());
  }
  useSyncStore.getState().setStateForScope(account.scope, {
    pendingCount: afterCounts.pending,
    conflictCount: afterCounts.conflicts,
    failedCount: afterCounts.failed,
    status: processed.kind === 'succeeded'
      ? (afterCounts.conflicts || afterCounts.failed ? 'conflict' : afterCounts.pending ? 'pending' : 'synced')
      : processed.kind === 'conflict' || processed.kind === 'failed' ? 'conflict'
        : processed.kind === 'auth-required' ? 'auth-required'
          : 'pending',
  });

  if (processed.kind === 'succeeded') return { offlineQueued: false, result: processed.result };
  if (processed.kind === 'retryable' || processed.kind === 'auth-required') return { offlineQueued: true };
  throw (processed as any).error;
}

export async function markPickupOfflineCapable(requestId: string) {
  return queueStaffAction('MARK_PICKUP', requestId, { requestId }, () => markPickedUp(requestId));
}

export async function partialCollectOfflineCapable(requestId: string, collectedAmount: number) {
  return queueStaffAction('PARTIAL_COLLECT', requestId, { requestId, collectedAmount }, () => partiallyCollectCashRequest(requestId, collectedAmount));
}
