const DATABASE = 'chitwise-offline-v1';
let opening;

function database() {
  if (!opening) opening = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 3);
    request.onupgradeneeded = () => {
      for (const [name, keyPath] of [['accounts', 'scope'], ['keys', 'scope'], ['cache', 'key'], ['outbox', 'key'],
        ['datasets', 'key'], ['preparation', 'scope'], ['preparationJobs', 'key']]) {
        if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name, { keyPath });
      }
      const jobs = request.transaction.objectStore('preparationJobs');
      if (!jobs.indexNames.contains('ready')) jobs.createIndex('ready', ['scope', 'cycle', 'status', 'nextAttemptAt']);
      if (!jobs.indexNames.contains('status')) jobs.createIndex('status', ['scope', 'cycle', 'status']);
      const outbox = request.transaction.objectStore('outbox');
      if (!outbox.indexNames.contains('scope-status')) outbox.createIndex('scope-status', ['scope', 'status']);
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => { db.close(); opening = undefined; };
      resolve(db);
    };
    request.onerror = () => { opening = undefined; reject(request.error); };
  });
  return opening;
}

async function transaction(store, mode, execute) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    let result;
    const request = execute(tx.objectStore(store));
    if (request) request.onsuccess = () => { result = request.result; };
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Local storage write was interrupted'));
  });
}

export const readRow = (store, key) => transaction(store, 'readonly', (s) => s.get(key));
export const readRows = (store) => transaction(store, 'readonly', (s) => s.getAll());
export const writeRow = (store, row) => transaction(store, 'readwrite', (s) => s.put(row));
export const deleteRow = (store, key) => transaction(store, 'readwrite', (s) => s.delete(key));
export const readRowsWithPrefix = (store, prefix) => transaction(store, 'readonly',
  (s) => s.getAll(IDBKeyRange.bound(prefix, prefix + '\uffff')));
const countRowsWithPrefix = (store, prefix) => transaction(store, 'readonly',
  (s) => s.count(IDBKeyRange.bound(prefix, prefix + '\uffff')));
export const readIndexRows = (store, index, range, limit) => transaction(store, 'readonly', (s) => s.index(index).getAll(range, limit));
export const countIndexRows = (store, index, range) => transaction(store, 'readonly', (s) => s.index(index).count(range));
export const deleteRows = (store, keys) => transaction(store, 'readwrite', (s) => { for (const key of keys) s.delete(key); });

export async function addRowsIfAbsent(store, rows) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    for (const row of rows) {
      const request = tx.objectStore(store).add(row);
      request.onerror = (event) => {
        if (request.error?.name === 'ConstraintError') { event.preventDefault(); event.stopPropagation(); }
      };
    }
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Data preparation write was interrupted'));
  });
}

/** Read-modify-write stays in one transaction, including across tabs/workers. */
export async function mutateRow(store, key, change) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    const records = tx.objectStore(store);
    let result;
    const request = records.get(key);
    request.onsuccess = () => {
      try {
        result = change(request.result);
        if (result !== undefined) records.put(result);
      } catch (error) { reject(error); tx.abort(); }
    };
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Local storage write was interrupted'));
  });
}

async function encryptionKey(scope) {
  const existing = await readRow('keys', scope);
  if (existing) return existing.cryptoKey;
  const [counts, preparation] = await Promise.all([
    Promise.all(['cache', 'outbox', 'datasets'].map((store) => countRowsWithPrefix(store, `${scope}:`))),
    readRow('preparation', scope),
  ]);
  if (counts.some((count) => count > 0) || preparation?.encrypted) {
    throw new Error('Saved data is locked on this browser. Its encrypted records are preserved; a replacement key will not be created.');
  }
  const cryptoKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  return (await mutateRow('keys', scope, (prior) => prior ?? { scope, cryptoKey })).cryptoKey;
}

export async function seal(scope, value) {
  const key = await encryptionKey(scope);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv,
    additionalData: new TextEncoder().encode(scope) }, key, new TextEncoder().encode(JSON.stringify(value)));
  return { iv, ciphertext };
}

export async function unseal(scope, sealed) {
  // Never generate a replacement key for existing ciphertext.
  const key = await readRow('keys', scope);
  if (!key) throw new Error('Saved data is locked on this browser');
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: sealed.iv,
    additionalData: new TextEncoder().encode(scope) }, key.cryptoKey, sealed.ciphertext);
  return JSON.parse(new TextDecoder().decode(plain));
}

export async function claimOutbox(key, now = Date.now()) {
  let claimed;
  await mutateRow('outbox', key, (entry) => {
    if (!entry || ['SUCCEEDED', 'CONFLICT', 'FAILED'].includes(entry.status)
        || entry.nextAttemptAt > now || (entry.status === 'SYNCING' && entry.leaseUntil > now)) return undefined;
    claimed = { ...entry, status: 'SYNCING', attempts: entry.attempts + 1, leaseUntil: now + 120_000, leaseId: crypto.randomUUID() };
    return claimed;
  });
  return claimed;
}
