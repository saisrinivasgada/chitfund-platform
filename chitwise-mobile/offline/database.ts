import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import * as SQLite from 'expo-sqlite';
import { File } from 'expo-file-system';
import type { PersistedClient, Persister } from '@tanstack/query-persist-client-core';
import type { QueuedOperation, SyncCounts, SyncOperationStatus } from './types';

const DATABASE_VERSION = 6;

// One open connection per account scope. Each scope gets its own encrypted
// database file and its own key — tenant A's key reveals nothing about tenant B.
const openDatabases = new Map<string, Promise<SQLite.SQLiteDatabase>>();

async function scopeHash(accountScope: string): Promise<string> {
  const hex = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    accountScope,
  );
  return hex.slice(0, 16);
}

/** Captured before recording starts, so sign-out/relogin cannot revive an old save. */
export async function offlineRecordingEpoch(scope: string): Promise<string> {
  return await SecureStore.getItemAsync(`chitwise_offline_epoch_${await scopeHash(scope)}`) ?? '';
}

async function databaseKeyForScope(hash: string, fileExists: boolean): Promise<string> {
  const keyId = `chitwise_offline_key_${hash}`;
  const existing = await SecureStore.getItemAsync(keyId);
  if (fileExists && (!existing || !/^[a-f0-9]{64}$/i.test(existing))) {
    throw new Error('Saved data is locked on this device. Unlock the device and try again. Existing records are preserved.');
  }
  const generated = existing && /^[a-f0-9]{64}$/i.test(existing) ? existing
    : `${Crypto.randomUUID()}${Crypto.randomUUID()}`.replace(/-/g, '');
  await SecureStore.setItemAsync(keyId, generated, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY });
  return generated;
}

function offlineFileExists(filename: string): boolean {
  const directory = SQLite.defaultDatabaseDirectory;
  if (!directory) return false;
  // Android SQLite exposes an absolute filesystem path; Expo File requires a
  // file URI. iOS already supplies a file URI. Preserve the same database path.
  const uri = directory.startsWith('/') ? `file://${directory}` : directory;
  return new File(uri, filename).exists;
}

/** Detect historical queues without creating a database for online-only accounts. */
export async function hasOfflineDatabase(accountScope: string): Promise<boolean> {
  if (openDatabases.has(accountScope)) return true;
  if (!SQLite.defaultDatabaseDirectory) return false;
  const hash = await scopeHash(accountScope);
  return offlineFileExists(`chitwise-offline-${hash}.db`);
}

async function openAndMigrate(accountScope: string): Promise<SQLite.SQLiteDatabase> {
  const hash = await scopeHash(accountScope);
  const filename = `chitwise-offline-${hash}.db`;
  const fileExists = offlineFileExists(filename);
  const key = await databaseKeyForScope(hash, fileExists);
  const db = await SQLite.openDatabaseAsync(filename);

  // The key contains validated hexadecimal characters only. PRAGMA key does not
  // accept bound parameters and must be the first statement against the file.
  await db.execAsync(`PRAGMA key = "x'${key}'";`);
  const cipher = await db.getFirstAsync<{ cipher_version: string }>('PRAGMA cipher_version');
  if (!cipher?.cipher_version) {
    throw new Error('Encrypted offline storage is unavailable. Install a ChitWise development or production build.');
  }
  const priorVersion = (await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version'))?.user_version ?? 0;

  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    PRAGMA foreign_keys = ON;
    PRAGMA cipher_memory_security = ON;

    CREATE TABLE IF NOT EXISTS persisted_query_clients (
      account_scope TEXT PRIMARY KEY NOT NULL,
      client_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sync_operations (
      operation_id TEXT PRIMARY KEY NOT NULL,
      account_scope TEXT NOT NULL,
      tenant_id TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      payload TEXT NOT NULL,
      payload_hash TEXT NOT NULL,
      expected_version INTEGER,
      status TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      next_attempt_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      last_error_code TEXT,
      last_error_message TEXT,
      server_receipt_id TEXT,
      server_review_id TEXT,
      server_receipt_json TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_sync_operations_ready
      ON sync_operations(account_scope, status, next_attempt_at, created_at);

    CREATE TABLE IF NOT EXISTS sync_metadata (
      account_scope TEXT PRIMARY KEY NOT NULL,
      last_synced_at INTEGER,
      last_error TEXT,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS offline_session_guard (
      account_scope TEXT PRIMARY KEY NOT NULL,
      signed_out INTEGER NOT NULL DEFAULT 0,
      session_epoch TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS offline_http_cache (
      cache_key TEXT PRIMARY KEY NOT NULL,
      account_scope TEXT NOT NULL,
      response_json TEXT NOT NULL,
      saved_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS offline_datasets (
      dataset_key TEXT PRIMARY KEY NOT NULL,
      data_json TEXT NOT NULL,
      saved_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS offline_root_ids (
      cycle_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      record_id TEXT NOT NULL,
      PRIMARY KEY(cycle_id, kind, record_id)
    );

    CREATE TABLE IF NOT EXISTS offline_preparation (
      account_scope TEXT PRIMARY KEY NOT NULL,
      manifest_json TEXT,
      lease_token TEXT,
      lease_until INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS offline_preparation_jobs (
      job_key TEXT PRIMARY KEY NOT NULL,
      cycle_id TEXT NOT NULL,
      request_json TEXT NOT NULL,
      status TEXT NOT NULL,
      next_attempt_at INTEGER NOT NULL DEFAULT 0,
      error_message TEXT
    );
    CREATE INDEX IF NOT EXISTS offline_preparation_jobs_cycle_status
      ON offline_preparation_jobs(cycle_id, status, job_key);

  `);
  const guardColumns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(offline_session_guard)');
  if (!guardColumns.some((column) => column.name === 'session_epoch')) await db.execAsync("ALTER TABLE offline_session_guard ADD COLUMN session_epoch TEXT NOT NULL DEFAULT ''");
  const blocked = await SecureStore.getItemAsync(`chitwise_offline_signedout_${hash}`) === '1';
  const epoch = await offlineRecordingEpoch(accountScope);
  await db.runAsync('INSERT OR IGNORE INTO offline_session_guard(account_scope,signed_out,session_epoch) VALUES (?,?,?)',accountScope,blocked?1:0,epoch);
  if (blocked) await db.runAsync('UPDATE offline_session_guard SET signed_out=1,session_epoch=? WHERE account_scope=?',epoch,accountScope);
  const operationColumns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(sync_operations)');
  for (const name of ['server_review_id', 'server_receipt_json']) {
    if (!operationColumns.some((column) => column.name === name)) await db.execAsync(`ALTER TABLE sync_operations ADD COLUMN ${name} TEXT`);
  }
  if (priorVersion < 3) {
    // Older failures may only reflect expired subscriptions or date cutoffs.
    // Requeue them for quarantine/review, never for automatic financial posting.
    await db.runAsync(`UPDATE sync_operations SET status='QUEUED', next_attempt_at=?, updated_at=?,
      last_error_message='Older saved payment will be uploaded for admin review.'
      WHERE action='RECORD_PAYMENT' AND status IN ('PERMANENT_FAILURE','CONFLICT')
        AND server_review_id IS NULL AND CASE WHEN json_valid(payload)
          THEN json_extract(payload, '$.offlineAuthorization') ELSE 'UNREADABLE' END IS NULL`, Date.now(), Date.now());
  }
  await db.execAsync(`PRAGMA user_version = ${DATABASE_VERSION};`);
  return db;
}

export function getOfflineDatabase(accountScope: string): Promise<SQLite.SQLiteDatabase> {
  let promise = openDatabases.get(accountScope);
  if (!promise) {
    promise = openAndMigrate(accountScope).catch((error) => {
      openDatabases.delete(accountScope);
      throw error;
    });
    openDatabases.set(accountScope, promise);
  }
  return promise;
}

export function createEncryptedQueryPersister(accountScope: string): Persister {
  return {
    persistClient: async (client: PersistedClient) => {
      try {
        const db = await getOfflineDatabase(accountScope);
        await db.runAsync(
          `INSERT INTO persisted_query_clients(account_scope, client_json, updated_at)
           VALUES (?, ?, ?)
           ON CONFLICT(account_scope) DO UPDATE SET
             client_json = excluded.client_json,
             updated_at = excluded.updated_at`,
          accountScope,
          JSON.stringify(client),
          Date.now(),
        );
      } catch {
        // Online-only environments such as Expo Go must keep functioning. The
        // sync UI reports that encrypted offline storage needs a native build.
      }
    },
    restoreClient: async () => {
      try {
        const db = await getOfflineDatabase(accountScope);
        const row = await db.getFirstAsync<{ client_json: string }>(
          'SELECT client_json FROM persisted_query_clients WHERE account_scope = ?',
          accountScope,
        );
        if (!row) return undefined;
        return JSON.parse(row.client_json) as PersistedClient;
      } catch {
        return undefined;
      }
    },
    removeClient: async () => {
      try {
        const db = await getOfflineDatabase(accountScope);
        await db.runAsync('DELETE FROM persisted_query_clients WHERE account_scope = ?', accountScope);
      } catch {}
    },
  };
}

function mapOperation(row: any): QueuedOperation {
  let payload: any;
  try { payload = JSON.parse(row.payload); }
  catch { payload = { localRecoveryRequired: true }; }
  let serverReceipt = null;
  try { serverReceipt = row.server_receipt_json ? JSON.parse(row.server_receipt_json) : null; }
  catch { /* Keep the authoritative receipt ID and original row for recovery. */ }
  return {
    operationId: row.operation_id,
    accountScope: row.account_scope,
    tenantId: row.tenant_id,
    actorId: row.actor_id,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    payload,
    payloadHash: row.payload_hash,
    expectedVersion: row.expected_version,
    status: row.status,
    attempts: row.attempts,
    nextAttemptAt: row.next_attempt_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastErrorCode: row.last_error_code,
    lastErrorMessage: payload?.localRecoveryRequired ? 'Saved record needs local recovery. Its original data is preserved.' : row.last_error_message,
    serverReceiptId: row.server_receipt_id,
    serverReviewId: row.server_review_id,
    serverReceipt,
  };
}

export async function insertOperation(operation: QueuedOperation, expectedSessionEpoch?: string): Promise<void> {
  const epoch = expectedSessionEpoch ?? await offlineRecordingEpoch(operation.accountScope);
  const db = await getOfflineDatabase(operation.accountScope);
  const guard = await db.getFirstAsync<{ signed_out: number; session_epoch: string }>('SELECT signed_out,session_epoch FROM offline_session_guard WHERE account_scope=?', operation.accountScope);
  if (guard?.signed_out || guard?.session_epoch !== epoch) throw new Error('Sign in again before saving a payment');
  const prior = await db.getFirstAsync<{ payload_hash: string; account_scope: string }>(
    'SELECT payload_hash, account_scope FROM sync_operations WHERE operation_id = ?',
    operation.operationId,
  );
  if (prior) {
    if (prior.payload_hash !== operation.payloadHash || prior.account_scope !== operation.accountScope) {
      throw new Error('This operation ID is already associated with different payment details');
    }
    return;
  }

  await db.runAsync(
    `INSERT INTO sync_operations(
       operation_id, account_scope, tenant_id, actor_id, action, entity_type, entity_id,
       payload, payload_hash, expected_version, status, attempts, next_attempt_at,
       created_at, updated_at, last_error_code, last_error_message, server_receipt_id
     ) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
       WHERE NOT EXISTS (SELECT 1 FROM offline_session_guard WHERE account_scope=? AND (signed_out=1 OR session_epoch<>?))
     ON CONFLICT(operation_id) DO NOTHING`,
    operation.operationId,
    operation.accountScope,
    operation.tenantId,
    operation.actorId,
    operation.action,
    operation.entityType,
    operation.entityId ?? null,
    JSON.stringify(operation.payload),
    operation.payloadHash,
    operation.expectedVersion ?? null,
    operation.status,
    operation.attempts,
    operation.nextAttemptAt,
    operation.createdAt,
    operation.updatedAt,
    operation.lastErrorCode ?? null,
    operation.lastErrorMessage ?? null,
    operation.serverReceiptId ?? null,
    operation.accountScope,
    epoch,
  );
  // A second caller can insert after the initial lookup. Verify the row that
  // actually won rather than letting a uniqueness race fall through to HTTP.
  const stored = await db.getFirstAsync<{ payload_hash: string; account_scope: string }>(
    'SELECT payload_hash, account_scope FROM sync_operations WHERE operation_id = ?', operation.operationId);
  if (!stored) throw new Error('The payment could not be saved securely on this device');
  if (stored.payload_hash !== operation.payloadHash || stored.account_scope !== operation.accountScope) {
    throw new Error('This operation ID is already associated with different payment details');
  }
}

export async function getOperation(operationId: string, accountScope: string): Promise<QueuedOperation | null> {
  const db = await getOfflineDatabase(accountScope);
  const row = await db.getFirstAsync<any>('SELECT * FROM sync_operations WHERE operation_id = ?', operationId);
  return row ? mapOperation(row) : null;
}

/** A compare-and-set shares the same row lock as delivery. Payload/allocations stay immutable. */
export async function requestPaymentCancellation(scope: string, operationId: string, reason: string, actor: string): Promise<void> {
  if (reason.trim().length < 5 || reason.trim().length > 500) throw new Error('Explain the mistaken entry in 5–500 characters');
  const db = await getOfflineDatabase(scope);
  const evidence = JSON.stringify({ cancellationRequest: { reason: reason.trim(), noMoneyCollected: true, cancelledBy: actor, requestedAt: new Date().toISOString() } });
  const result = await db.runAsync(`UPDATE sync_operations SET
    status=CASE WHEN attempts=0 THEN 'CANCELLED' ELSE 'QUEUED' END,
    server_receipt_json=?, last_error_code='CANCEL_REQUESTED',
    last_error_message=CASE WHEN attempts=0 THEN 'Cancelled before sending. No money collected.' ELSE 'Cancellation waiting for server verification.' END,
    next_attempt_at=0, updated_at=?
    WHERE account_scope=? AND operation_id=? AND actor_id=? AND action='RECORD_PAYMENT'
      AND status IN ('QUEUED','RETRYABLE_FAILURE','PAUSED_ACCESS','PERMANENT_FAILURE','CONFLICT')
      AND server_review_id IS NULL AND server_receipt_id IS NULL AND server_receipt_json IS NULL
      AND NOT EXISTS(SELECT 1 FROM offline_session_guard WHERE account_scope=? AND signed_out=1)`, evidence, Date.now(), scope, operationId, actor, scope);
  if (result.changes !== 1) throw new Error('This payment started syncing or is already on the server. Refresh its details; received payments use Void in History.');
}

export async function getReadyOperations(accountScope: string, limit = 25): Promise<QueuedOperation[]> {
  const db = await getOfflineDatabase(accountScope);
  const rows = await db.getAllAsync<any>(
    `SELECT * FROM sync_operations
     WHERE account_scope = ?
       AND status IN ('QUEUED', 'RETRYABLE_FAILURE', 'PAUSED_ACCESS')
       AND next_attempt_at <= ?
     ORDER BY created_at ASC
     LIMIT ?`,
    accountScope,
    Date.now(),
    limit,
  );
  return rows.map(mapOperation);
}

/** Atomic per-entry lease shared by foreground and native background runtimes. */
export async function claimOperation(operation: QueuedOperation): Promise<boolean> {
  const db = await getOfflineDatabase(operation.accountScope);
  const result = await db.runAsync(
    `UPDATE sync_operations SET status = 'SYNCING', attempts = attempts + 1, updated_at = ?
     WHERE operation_id = ? AND account_scope = ?
       AND status IN ('QUEUED', 'RETRYABLE_FAILURE', 'PAUSED_ACCESS')
       AND NOT EXISTS (SELECT 1 FROM offline_session_guard WHERE account_scope=? AND signed_out=1)`,
    Date.now(), operation.operationId, operation.accountScope, operation.accountScope,
  );
  return result.changes === 1;
}

export async function recoverInterruptedOperations(accountScope: string): Promise<void> {
  const db = await getOfflineDatabase(accountScope);
  const leaseExpiredAt = Date.now() - 2 * 60_000;
  await db.runAsync(
    `UPDATE sync_operations
     SET status = 'RETRYABLE_FAILURE', next_attempt_at = ?,
         last_error_code = 'INTERRUPTED',
         last_error_message = 'The app closed during sync; retrying safely',
         updated_at = ?
     WHERE account_scope = ? AND status = 'SYNCING' AND updated_at < ?`,
    Date.now(),
    Date.now(),
    accountScope,
    leaseExpiredAt,
  );
}

export async function makeRetryableOperationsReady(accountScope: string): Promise<void> {
  const db = await getOfflineDatabase(accountScope);
  await db.runAsync(
    `UPDATE sync_operations SET next_attempt_at = ?, updated_at = ?
     WHERE account_scope = ? AND status IN ('RETRYABLE_FAILURE', 'PAUSED_ACCESS')`,
    Date.now(),
    Date.now(),
    accountScope,
  );
}

const COMPLETED_DECISIONS = "(status='CANCELLED' OR (status='SUCCEEDED' AND json_valid(server_receipt_json) AND json_extract(server_receipt_json,'$.offlineReviewResolution') IN ('CANCELLED','REFUNDED')))";

export async function getVisibleOperations(accountScope: string, limit = 25, completed = false): Promise<QueuedOperation[]> {
  const db = await getOfflineDatabase(accountScope);
  const rows = await db.getAllAsync<any>(
    `SELECT * FROM sync_operations
     WHERE account_scope = ?
       AND ${completed ? COMPLETED_DECISIONS : "status IN ('QUEUED', 'SYNCING', 'RETRYABLE_FAILURE', 'PAUSED_ACCESS', 'CONFLICT', 'PERMANENT_FAILURE')"}
     ORDER BY created_at DESC
     LIMIT ?`,
    accountScope,
    limit,
  );
  return rows.map(mapOperation);
}

export async function getCompletedOperationCount(accountScope: string): Promise<number> {
  if (!await hasOfflineDatabase(accountScope)) return 0;
  const db = await getOfflineDatabase(accountScope);
  return Number((await db.getFirstAsync<{ count: number }>(`SELECT COUNT(*) AS count FROM sync_operations WHERE account_scope=? AND ${COMPLETED_DECISIONS}`, accountScope))?.count ?? 0);
}

export async function getOperationsAwaitingReview(accountScope: string, force = false): Promise<QueuedOperation[]> {
  const db = await getOfflineDatabase(accountScope);
  const rows = await db.getAllAsync<any>(`SELECT * FROM sync_operations WHERE account_scope=?
    AND status='CONFLICT' AND server_review_id IS NOT NULL AND (?=1 OR next_attempt_at<=?) ORDER BY next_attempt_at LIMIT 50`, accountScope, force ? 1 : 0, Date.now());
  return rows.map(mapOperation);
}

export async function deferReviewPoll(operation: QueuedOperation) {
  const db = await getOfflineDatabase(operation.accountScope);
  await db.runAsync("UPDATE sync_operations SET next_attempt_at=? WHERE operation_id=? AND status='CONFLICT'",
    Date.now() + 60_000, operation.operationId);
}

export async function updateOperation(
  operationId: string,
  accountScope: string,
  status: SyncOperationStatus,
  values: {
    attempts?: number;
    nextAttemptAt?: number;
    errorCode?: string | null;
    errorMessage?: string | null;
    serverReceiptId?: string | null;
    serverReviewId?: string | null;
    serverReceipt?: unknown;
  } = {},
): Promise<void> {
  const db = await getOfflineDatabase(accountScope);
  await db.runAsync(
    `UPDATE sync_operations SET
       status = ?,
       attempts = COALESCE(?, attempts),
       next_attempt_at = COALESCE(?, next_attempt_at),
       last_error_code = ?,
       last_error_message = ?,
       server_receipt_id = COALESCE(?, server_receipt_id),
       server_review_id = COALESCE(?, server_review_id),
       server_receipt_json = COALESCE(?, server_receipt_json),
       updated_at = ?
     WHERE operation_id = ?`,
    status,
    values.attempts ?? null,
    values.nextAttemptAt ?? null,
    values.errorCode ?? null,
    values.errorMessage ?? null,
    values.serverReceiptId ?? null,
    values.serverReviewId ?? null,
    values.serverReceipt ? JSON.stringify(values.serverReceipt) : null,
    Date.now(),
    operationId,
  );
}

export async function getPendingCountForMember(accountScope: string, memberId: string): Promise<number> {
  try {
    const db = await getOfflineDatabase(accountScope);
    const row = await db.getFirstAsync<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM sync_operations
       WHERE account_scope = ? AND entity_id = ? AND action = 'RECORD_PAYMENT'
         AND status IN ('QUEUED', 'SYNCING', 'RETRYABLE_FAILURE', 'PAUSED_ACCESS')`,
      accountScope,
      memberId,
    );
    return Number(row?.cnt ?? 0);
  } catch {
    return 0;
  }
}

export async function getSyncCounts(accountScope: string): Promise<SyncCounts> {
  const db = await getOfflineDatabase(accountScope);
  const row = await db.getFirstAsync<{ pending: number; paused: number; conflicts: number; failed: number; syncing: number }>(
    `SELECT
       SUM(CASE WHEN status IN ('QUEUED', 'SYNCING', 'RETRYABLE_FAILURE', 'PAUSED_ACCESS') THEN 1 ELSE 0 END) AS pending,
       SUM(CASE WHEN status = 'SYNCING' THEN 1 ELSE 0 END) AS syncing,
       SUM(CASE WHEN status = 'PAUSED_ACCESS' THEN 1 ELSE 0 END) AS paused,
       SUM(CASE WHEN status = 'CONFLICT' THEN 1 ELSE 0 END) AS conflicts,
       SUM(CASE WHEN status = 'PERMANENT_FAILURE' THEN 1 ELSE 0 END) AS failed
     FROM sync_operations WHERE account_scope = ?`,
    accountScope,
  );
  return {
    syncing: Number(row?.syncing ?? 0),
    pending: Number(row?.pending ?? 0),
    paused: Number(row?.paused ?? 0),
    conflicts: Number(row?.conflicts ?? 0),
    failed: Number(row?.failed ?? 0),
  };
}

export async function getLastSyncedAt(accountScope: string): Promise<number | null> {
  const db = await getOfflineDatabase(accountScope);
  const row = await db.getFirstAsync<{ last_synced_at: number | null }>(
    'SELECT last_synced_at FROM sync_metadata WHERE account_scope = ?',
    accountScope,
  );
  return row?.last_synced_at ?? null;
}

const UNSENT_OPERATION = "account_scope=? AND status NOT IN ('SUCCEEDED','CANCELLED') AND server_review_id IS NULL AND server_receipt_id IS NULL";

export async function getUnsentOperationCount(scope: string): Promise<number> {
  if (!await hasOfflineDatabase(scope)) return 0;
  const db = await getOfflineDatabase(scope);
  const row = await db.getFirstAsync<{ count: number }>(`SELECT COUNT(*) AS count FROM sync_operations WHERE ${UNSENT_OPERATION}`, scope);
  return Number(row?.count ?? 0);
}

/** Explicit user consent only. The guard prevents stale workers reviving discarded work. */
export async function discardUnsentOperationsForSignOut(scope: string): Promise<void> {
  const hash = await scopeHash(scope); const epoch = Crypto.randomUUID();
  await SecureStore.setItemAsync(`chitwise_offline_epoch_${hash}`,epoch,{ keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY });
  await SecureStore.setItemAsync(`chitwise_offline_signedout_${hash}`,'1',{ keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY });
  if (!await hasOfflineDatabase(scope)) return;
  await withOfflineTransaction(scope, async (tx) => {
    await tx.runAsync('INSERT INTO offline_session_guard(account_scope,signed_out,session_epoch) VALUES (?,1,?) ON CONFLICT(account_scope) DO UPDATE SET signed_out=1,session_epoch=excluded.session_epoch', scope,epoch);
    await tx.runAsync(`DELETE FROM sync_operations WHERE ${UNSENT_OPERATION}`, scope);
    await tx.runAsync('DELETE FROM persisted_query_clients WHERE account_scope=?', scope);
  });
}

export async function resumeOfflineSession(scope: string): Promise<void> {
  await SecureStore.deleteItemAsync(`chitwise_offline_signedout_${await scopeHash(scope)}`);
  if (!await hasOfflineDatabase(scope)) return;
  const db = await getOfflineDatabase(scope);
  await db.runAsync('UPDATE offline_session_guard SET signed_out=0 WHERE account_scope=?', scope);
}

export async function setLastSyncedAt(accountScope: string, at: number, error?: string | null): Promise<void> {
  const db = await getOfflineDatabase(accountScope);
  await db.runAsync(
    `INSERT INTO sync_metadata(account_scope, last_synced_at, last_error, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(account_scope) DO UPDATE SET
       last_synced_at = excluded.last_synced_at,
       last_error = excluded.last_error,
       updated_at = excluded.updated_at`,
    accountScope,
    at,
    error ?? null,
    Date.now(),
  );
}

export async function pruneCompletedOperations(accountScope: string): Promise<void> {
  const db = await getOfflineDatabase(accountScope);
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  await db.runAsync(
    `DELETE FROM sync_operations
     WHERE account_scope = ? AND status='SUCCEEDED' AND server_receipt_id IS NOT NULL AND updated_at < ?`,
    accountScope,
    thirtyDaysAgo,
  );
}

/**
 * Removes encrypted offline data only after the user explicitly removes the
 * saved account from this device. Voluntary sign-out separately discards only
 * unconfirmed operations after an explicit warning; forced session locks preserve them.
 *
 * Deletes the database file entirely and removes the encryption key from
 * SecureStore — even if someone recovers the file the key is gone.
 */
export async function purgeAccountOfflineData(accountScope: string): Promise<void> {
  openDatabases.delete(accountScope);
  const hash = await scopeHash(accountScope);
  const filename = `chitwise-offline-${hash}.db`;
  try {
    await SQLite.deleteDatabaseAsync(filename);
  } catch {
    // File may not exist yet (account created but never recorded offline)
  }
  await SecureStore.deleteItemAsync(`chitwise_offline_key_${hash}`);
}

/** A dedicated, keyed connection keeps financial writes out of download transactions. */
export async function withOfflineTransaction(scope: string, work: (tx: SQLite.SQLiteDatabase) => Promise<void>) {
  await getOfflineDatabase(scope);
  const hash = await scopeHash(scope);
  const key = await databaseKeyForScope(hash, true);
  const tx = await SQLite.openDatabaseAsync(`chitwise-offline-${hash}.db`, { useNewConnection: true });
  try {
    await tx.execAsync(`PRAGMA key = "x'${key}'"; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON; BEGIN IMMEDIATE;`);
    try { await work(tx); await tx.execAsync('COMMIT'); }
    catch (error) { await tx.execAsync('ROLLBACK'); throw error; }
  } finally { await tx.closeAsync(); }
}

export async function getRecoverablePayments(scope: string): Promise<QueuedOperation<any>[]> {
  if (!await hasOfflineDatabase(scope)) return [];
  const db = await getOfflineDatabase(scope);
  const rows = await db.getAllAsync<any>(`SELECT * FROM sync_operations WHERE action='RECORD_PAYMENT'
    AND status IN ('QUEUED','RETRYABLE_FAILURE','PAUSED_ACCESS','CONFLICT','PERMANENT_FAILURE')
    AND server_review_id IS NULL ORDER BY created_at LIMIT 25`);
  return rows.map(mapOperation);
}

export async function getRecoverableStaffCollections(scope: string): Promise<QueuedOperation<any>[]> {
  if (!await hasOfflineDatabase(scope)) return [];
  const db = await getOfflineDatabase(scope);
  const rows = await db.getAllAsync<any>(`SELECT * FROM sync_operations WHERE account_scope=? AND action IN ('MARK_PICKUP','PARTIAL_COLLECT')
    AND status IN ('QUEUED','RETRYABLE_FAILURE','PAUSED_ACCESS','CONFLICT','PERMANENT_FAILURE')
    AND server_review_id IS NULL ORDER BY created_at LIMIT 25`, scope);
  return rows.map(mapOperation);
}
