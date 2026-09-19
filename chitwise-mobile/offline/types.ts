export type SyncOperationStatus =
  | 'QUEUED'
  | 'SYNCING'
  | 'RETRYABLE_FAILURE'
  | 'SUCCEEDED'
  | 'CONFLICT'
  | 'PERMANENT_FAILURE'
  | 'CANCELLED';

export type SyncStatus =
  | 'offline'
  | 'syncing'
  | 'synced'
  | 'pending'
  | 'conflict'
  | 'auth-required'
  | 'error';

export interface QueuedOperation<TPayload = unknown> {
  operationId: string;
  accountScope: string;
  tenantId: string;
  actorId: string;
  action: 'RECORD_PAYMENT';
  entityType: 'PAYMENT';
  entityId?: string | null;
  payload: TPayload;
  payloadHash: string;
  expectedVersion?: number | null;
  status: SyncOperationStatus;
  attempts: number;
  nextAttemptAt: number;
  createdAt: number;
  updatedAt: number;
  lastErrorCode?: string | null;
  lastErrorMessage?: string | null;
  serverReceiptId?: string | null;
}

export interface SyncCounts {
  pending: number;
  conflicts: number;
  failed: number;
}

export interface OfflinePaymentResult {
  id: string;
  localOperationId: string;
  offlineQueued: true;
  status: 'PENDING_SYNC';
  chitId: string;
  memberId: string;
  totalAmount: number;
  paymentMode: string;
  paymentReference?: string;
  createdAt: string;
}
