import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import * as SQLite from 'expo-sqlite';
import type { PersistedClient, Persister } from '@tanstack/query-persist-client-core';
import type { QueuedOperation, SyncCounts, SyncOperationStatus } from './types';

const DATABASE_NAME = 'chitwise-offline.db';
const DATABASE_KEY_STORAGE = 'chitwise_offline_database_key_v1';
const DATABASE_VERSION = 1;

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function databaseKey(): Promise<string> {
  const existing = await SecureStore.getItemAsync(DATABASE_KEY_STORAGE);
  if (existing && /^[a-f0-9]{64}$/i.test(existing)) return existing;
  const generated = `${Crypto.randomUUID()}${Crypto.randomUUID()}`.replace(/-/g, '');
  await SecureStore.setItemAsync(DATABASE_KEY_STORAGE, generated);
  return generated;
}

async function openAndMigrate(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync(DATABASE_NAME);
  const key = await databaseKey();

  // The key contains validated hexadecimal characters only. PRAGMA key does not
  // accept bound parameters and must be the first statement against the file.
  await db.execAsync(`PRAGMA key = "x'${key}'";`);
  const cipher = await db.getFirstAsync<{ cipher_version: string }>('PRAGMA cipher_version');
  if (!cipher?.cipher_version) {
    throw new Error('Encrypted offline storage is unavailable. Install a ChitWise development or production build.');
  }

  await db.execAsync(`
    PRAGMA journal_mode = WAL;
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
      server_receipt_id TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_sync_operations_ready
      ON sync_operations(account_scope, status, next_attempt_at, created_at);

    CREATE TABLE IF NOT EXISTS sync_metadata (
      account_scope TEXT PRIMARY KEY NOT NULL,
      last_synced_at INTEGER,
      last_error TEXT,
      updated_at INTEGER NOT NULL
    );

    PRAGMA user_version = ${DATABASE_VERSION};
  `);
  return db;
}

export function getOfflineDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!databasePromise) {
    databasePromise = openAndMigrate().catch((error) => {
      databasePromise = null;
      throw error;
    });
  }
  return databasePromise;
}

export function createEncryptedQueryPersister(accountScope: string): Persister {
  return {
    persistClient: async (client: PersistedClient) => {
      try {
        const db = await getOfflineDatabase();
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
        const db = await getOfflineDatabase();
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
        const db = await getOfflineDatabase();
        await db.runAsync('DELETE FROM persisted_query_clients WHERE account_scope = ?', accountScope);
      } catch {}
    },
  };
}

function mapOperation(row: any): QueuedOperation {
  return {
    operationId: row.operation_id,
    accountScope: row.account_scope,
    tenantId: row.tenant_id,
    actorId: row.actor_id,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    payload: JSON.parse(row.payload),
    payloadHash: row.payload_hash,
    expectedVersion: row.expected_version,
    status: row.status,
    attempts: row.attempts,
    nextAttemptAt: row.next_attempt_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastErrorCode: row.last_error_code,
    lastErrorMessage: row.last_error_message,
    serverReceiptId: row.server_receipt_id,
  };
}

export async function insertOperation(operation: QueuedOperation): Promise<void> {
  const db = await getOfflineDatabase();
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
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
  );
}

export async function getOperation(operationId: string): Promise<QueuedOperation | null> {
  const db = await getOfflineDatabase();
  const row = await db.getFirstAsync<any>('SELECT * FROM sync_operations WHERE operation_id = ?', operationId);
  return row ? mapOperation(row) : null;
}

export async function getReadyOperations(accountScope: string, limit = 25): Promise<QueuedOperation[]> {
  const db = await getOfflineDatabase();
  const rows = await db.getAllAsync<any>(
    `SELECT * FROM sync_operations
     WHERE account_scope = ?
       AND status IN ('QUEUED', 'RETRYABLE_FAILURE')
       AND next_attempt_at <= ?
     ORDER BY created_at ASC
     LIMIT ?`,
    accountScope,
    Date.now(),
    limit,
  );
  return rows.map(mapOperation);
}

export async function recoverInterruptedOperations(accountScope: string): Promise<void> {
  const db = await getOfflineDatabase();
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
  const db = await getOfflineDatabase();
  await db.runAsync(
    `UPDATE sync_operations SET next_attempt_at = ?, updated_at = ?
     WHERE account_scope = ? AND status = 'RETRYABLE_FAILURE'`,
    Date.now(),
    Date.now(),
    accountScope,
  );
}

export async function getVisibleOperations(accountScope: string, limit = 10): Promise<QueuedOperation[]> {
  const db = await getOfflineDatabase();
  const rows = await db.getAllAsync<any>(
    `SELECT * FROM sync_operations
     WHERE account_scope = ?
       AND status IN ('QUEUED', 'SYNCING', 'RETRYABLE_FAILURE', 'CONFLICT', 'PERMANENT_FAILURE')
     ORDER BY created_at DESC
     LIMIT ?`,
    accountScope,
    limit,
  );
  return rows.map(mapOperation);
}

export async function updateOperation(
  operationId: string,
  status: SyncOperationStatus,
  values: {
    attempts?: number;
    nextAttemptAt?: number;
    errorCode?: string | null;
    errorMessage?: string | null;
    serverReceiptId?: string | null;
  } = {},
): Promise<void> {
  const db = await getOfflineDatabase();
  await db.runAsync(
    `UPDATE sync_operations SET
       status = ?,
       attempts = COALESCE(?, attempts),
       next_attempt_at = COALESCE(?, next_attempt_at),
       last_error_code = ?,
       last_error_message = ?,
       server_receipt_id = COALESCE(?, server_receipt_id),
       updated_at = ?
     WHERE operation_id = ?`,
    status,
    values.attempts ?? null,
    values.nextAttemptAt ?? null,
    values.errorCode ?? null,
    values.errorMessage ?? null,
    values.serverReceiptId ?? null,
    Date.now(),
    operationId,
  );
}

export async function getSyncCounts(accountScope: string): Promise<SyncCounts> {
  const db = await getOfflineDatabase();
  const row = await db.getFirstAsync<{ pending: number; conflicts: number; failed: number }>(
    `SELECT
       SUM(CASE WHEN status IN ('QUEUED', 'SYNCING', 'RETRYABLE_FAILURE') THEN 1 ELSE 0 END) AS pending,
       SUM(CASE WHEN status = 'CONFLICT' THEN 1 ELSE 0 END) AS conflicts,
       SUM(CASE WHEN status = 'PERMANENT_FAILURE' THEN 1 ELSE 0 END) AS failed
     FROM sync_operations WHERE account_scope = ?`,
    accountScope,
  );
  return {
    pending: Number(row?.pending ?? 0),
    conflicts: Number(row?.conflicts ?? 0),
    failed: Number(row?.failed ?? 0),
  };
}

export async function getLastSyncedAt(accountScope: string): Promise<number | null> {
  const db = await getOfflineDatabase();
  const row = await db.getFirstAsync<{ last_synced_at: number | null }>(
    'SELECT last_synced_at FROM sync_metadata WHERE account_scope = ?',
    accountScope,
  );
  return row?.last_synced_at ?? null;
}

export async function setLastSyncedAt(accountScope: string, at: number, error?: string | null): Promise<void> {
  const db = await getOfflineDatabase();
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
  const db = await getOfflineDatabase();
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  await db.runAsync(
    `DELETE FROM sync_operations
     WHERE account_scope = ? AND status IN ('SUCCEEDED', 'CANCELLED') AND updated_at < ?`,
    accountScope,
    thirtyDaysAgo,
  );
}

/**
 * Removes encrypted offline data only after the user explicitly removes the
 * saved account from this device. Normal logout intentionally preserves it so
 * queued writes can continue after the same account authenticates again.
 */
export async function purgeAccountOfflineData(accountScope: string): Promise<void> {
  const db = await getOfflineDatabase();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM persisted_query_clients WHERE account_scope = ?', accountScope);
    await db.runAsync('DELETE FROM sync_operations WHERE account_scope = ?', accountScope);
    await db.runAsync('DELETE FROM sync_metadata WHERE account_scope = ?', accountScope);
  });
}
