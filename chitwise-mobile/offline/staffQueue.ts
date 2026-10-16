import axios from 'axios';
import * as Crypto from 'expo-crypto';
import NetInfo from '@react-native-community/netinfo';
import { useAuthStore } from '../store/authStore';
import { requireOrganizationScope } from './accountScope';
import {
  claimOperation, getOperation, getSyncCounts, hasOfflineDatabase, insertOperation,
  setLastSyncedAt, updateOperation,
} from './database';
import type { QueuedOperation } from './types';
import type { ProcessOperationResult } from './paymentQueue';
import { useSyncStore } from '../store/syncStore';
import { accountForScope, requestAsAccount } from './accountClient';
import { refreshOfflineAccess, useOfflineAccessStore } from './access';
import { canRecordOffline, requireOfflineRecording } from './accessPolicy';

interface StaffPayload {
  requestId: string;
  collectedAmount?: number;
  expectedUpdatedAt?: string;
  recordedAt?: string;
  offlineAuthorization?: string;
}

async function send(scope: string, operationId: string, action: string, payload: StaffPayload) {
  const response = payload.offlineAuthorization
    ? await requestAsAccount(scope, {
      method: 'POST', url: '/payments/offline/staff-actions',
      data: { ...payload, operationId, action },
    })
    : await requestAsAccount(scope, {
      // Preserve older saved entries; never manufacture historical authority.
      method: 'PATCH', url: `/payments/requests/${payload.requestId}/${action === 'MARK_PICKUP' ? 'pickup' : 'partial-collect'}`,
      data: action === 'PARTIAL_COLLECT' ? { collectedAmount: payload.collectedAmount } : undefined,
    });
  return response.data?.data ?? response.data;
}

export async function processStaffOperation(operation: QueuedOperation<any>): Promise<ProcessOperationResult> {
  const owner = accountForScope(operation.accountScope);
  if (!owner?.sessionValid || owner.userId !== operation.actorId || owner.tenantId !== operation.tenantId) {
    return { kind: 'auth-required', error: new Error('Sign in to the account that recorded this collection') };
  }
  const attempts = operation.attempts + 1;
  try {
    if (!await claimOperation(operation)) return { kind: 'retryable', error: new Error('Collection is already synchronizing') };
    const result = await send(operation.accountScope, operation.operationId, operation.action, operation.payload);
    if (!result?.id) throw new Error('Server did not confirm a collection receipt; retrying safely');
    await updateOperation(operation.operationId, operation.accountScope, 'SUCCEEDED', {
      attempts, serverReceiptId: String(result.id),
    });
    return { kind: 'succeeded', result };
  } catch (error) {
    const status = axios.isAxiosError(error) ? error.response?.status : undefined;
    const code = String(axios.isAxiosError(error) ? error.response?.data?.errorCode ?? error.code : 'LOCAL_ERROR');
    const message = String(axios.isAxiosError(error) ? error.response?.data?.message ?? error.message
      : error instanceof Error ? error.message : 'Sync failed').slice(0, 300);
    if (status === 401 || (error as any)?.requiresLogin) {
      await updateOperation(operation.operationId, operation.accountScope, 'RETRYABLE_FAILURE', {
        attempts, nextAttemptAt: Date.now() + 60_000, errorCode: code,
        errorMessage: 'Sign in again to sync this saved collection',
      });
      return { kind: 'auth-required', error };
    }
    if (status === 403 || ['PLAN_002', 'ADD_ON_REQUIRED'].includes(code)) {
      await updateOperation(operation.operationId, operation.accountScope, 'PAUSED_ACCESS', {
        attempts, nextAttemptAt: Date.now() + 5 * 60_000, errorCode: code,
        errorMessage: 'Saved collection needs access restored or review. It remains on this device.',
      });
      return { kind: 'access-required', error };
    }
    if (status === 409 || (status === 400 && !operation.payload.offlineAuthorization)) {
      // A state conflict is never proof that this particular collection succeeded.
      await updateOperation(operation.operationId, operation.accountScope, 'CONFLICT', {
        attempts, errorCode: code, errorMessage: message,
      });
      return { kind: 'conflict', error };
    }
    if (status != null && status >= 400 && status < 500 && status !== 408 && status !== 429) {
      await updateOperation(operation.operationId, operation.accountScope, 'PERMANENT_FAILURE', {
        attempts, errorCode: code, errorMessage: message,
      });
      return { kind: 'failed', error };
    }
    const backoff = Math.min(5 * 60_000, 2 ** Math.max(0, attempts - 1) * 5_000);
    await updateOperation(operation.operationId, operation.accountScope, 'RETRYABLE_FAILURE', {
      attempts, nextAttemptAt: Date.now() + backoff + Math.floor(Math.random() * 2_000),
      errorCode: code, errorMessage: message,
    });
    return { kind: 'retryable', error };
  }
}

async function finish(operation: QueuedOperation<StaffPayload>, reachable: boolean) {
  if (operation.status === 'SUCCEEDED') return { offlineQueued: false, result: { id: operation.serverReceiptId } };
  let processed: ProcessOperationResult | undefined;
  if (reachable) {
    try { processed = await processStaffOperation(operation); } catch { /* Durable entry will retry. */ }
  }
  const counts = await getSyncCounts(operation.accountScope);
  if (processed?.kind === 'succeeded' && !counts.pending && !counts.conflicts && !counts.failed) {
    await setLastSyncedAt(operation.accountScope, Date.now());
  }
  useSyncStore.getState().setStateForScope(operation.accountScope, {
    pendingCount: counts.pending, conflictCount: counts.conflicts, failedCount: counts.failed,
    status: !reachable ? 'offline' : counts.conflicts || counts.failed ? 'conflict'
      : counts.paused ? 'access-required' : processed?.kind === 'auth-required' ? 'auth-required'
        : counts.pending ? 'pending' : 'synced',
  });
  if (processed?.kind === 'succeeded') return { offlineQueued: false, result: processed.result };
  if (processed?.kind === 'conflict' || processed?.kind === 'failed') throw processed.error;
  return { offlineQueued: true };
}

async function queueStaffAction(action: 'MARK_PICKUP' | 'PARTIAL_COLLECT', payload: StaffPayload) {
  const account = requireOrganizationScope(useAuthStore.getState().user);
  const network = await NetInfo.fetch();
  const reachable = network.isConnected === true && network.isInternetReachable !== false;
  const operationId = `${action}-${payload.requestId}-${payload.expectedUpdatedAt ?? 'legacy'}`;
  if (await hasOfflineDatabase(account.scope)) {
    const existing = await getOperation(operationId, account.scope) as QueuedOperation<StaffPayload> | null;
    if (existing) {
      if (existing.payload.collectedAmount !== payload.collectedAmount) throw new Error('This pickup already has a different saved collection amount. Review it before changing the amount.');
      return finish(existing, reachable);
    }
  }
  let access = useOfflineAccessStore.getState().accounts[account.scope];
  if (reachable && !canRecordOffline(access, action)) {
    try { access = await refreshOfflineAccess(account.scope); } catch { /* Existing valid grants survive transport failure. */ }
  }
  if (!canRecordOffline(access, action) || !payload.expectedUpdatedAt) {
    if (reachable) return { offlineQueued: false, result: await send(account.scope, operationId, action, payload) };
    requireOfflineRecording(access, action);
    throw new Error('Download the latest pickup details before recording this collection offline.');
  }
  const recordedAt = Date.now();
  const grant = requireOfflineRecording(access, action, recordedAt);
  if (!accountForScope(account.scope)?.sessionValid) throw new Error('Sign in again before recording this collection');
  const saved = { ...payload, offlineAuthorization: grant.token,
    recordedAt: new Date(access.serverTime + recordedAt - access.checkedAt).toISOString() };
  const now = Date.now();
  const operation: QueuedOperation<StaffPayload> = {
    operationId, accountScope: account.scope, tenantId: account.tenantId, actorId: account.actorId,
    action, entityType: 'CASH_REQUEST', entityId: payload.requestId, payload: saved,
    payloadHash: await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, JSON.stringify(saved)),
    status: 'QUEUED', attempts: 0, nextAttemptAt: now, createdAt: now, updatedAt: now,
  };
  try { await insertOperation(operation); } catch (error) {
    const collision = error instanceof Error && error.message.includes('already associated with different');
    if (reachable && !collision) return { offlineQueued: false, result: await send(account.scope, operationId, action, saved) };
    throw error;
  }
  return finish(operation, reachable);
}

export function markPickupOfflineCapable(requestId: string, expectedUpdatedAt?: string) {
  return queueStaffAction('MARK_PICKUP', { requestId, expectedUpdatedAt });
}

export function partialCollectOfflineCapable(requestId: string, collectedAmount: number, expectedUpdatedAt?: string) {
  if (!Number.isFinite(collectedAmount) || collectedAmount <= 0) throw new Error('Enter a valid collected amount');
  return queueStaffAction('PARTIAL_COLLECT', { requestId, collectedAmount, expectedUpdatedAt });
}
