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
export const countRowsWithPrefix = (store, prefix) => transaction(store, 'readonly',
  (s) => s.count(IDBKeyRange.bound(prefix, prefix + '\uffff')));
export const readIndexRows = (store, index, range, limit) => transaction(store, 'readonly', (s) => s.index(index).getAll(range, limit));
export const countIndexRows = (store, index, range) => transaction(store, 'readonly', (s) => s.index(index).count(range));
export const deleteRows = (store, keys) => transaction(store, 'readwrite', (s) => { for (const key of keys) s.delete(key); });

export async function readPrefixPage(storeName, prefix, offset, limit = 200) {
  const db = await database();
  return new Promise((resolve,reject) => {
    const tx = db.transaction(storeName,'readonly'); const rows = []; let skipped = offset === 0;
    const request = tx.objectStore(storeName).openCursor(IDBKeyRange.bound(prefix,prefix+'\uffff'));
    request.onsuccess = () => {
      const cursor = request.result; if (!cursor) return;
      if (!skipped) { skipped=true; cursor.advance(offset); return; }
      rows.push(cursor.value); if (rows.length < limit) cursor.continue();
    };
    tx.oncomplete = () => resolve(rows); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
  });
}

export async function deletePrefixBefore(storeName,prefix,before) {
  const db=await database();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(storeName,'readwrite');
    const request=tx.objectStore(storeName).openCursor(IDBKeyRange.bound(prefix,prefix+'\uffff'));
    request.onsuccess=()=>{ const cursor=request.result;if(!cursor)return;if(cursor.value.savedAt < before)cursor.delete();cursor.continue(); };
    tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
  });
}

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
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['accounts', 'outbox'], 'readwrite');
    const outbox = tx.objectStore('outbox'); let claimed;
    const request = outbox.get(key);
    request.onsuccess = () => {
      const entry = request.result;
      if (!entry || ['SUCCEEDED', 'CANCELLED', 'CONFLICT', 'FAILED'].includes(entry.status)
          || entry.nextAttemptAt > now || (entry.status === 'SYNCING' && entry.leaseUntil > now)) return;
      const owner = tx.objectStore('accounts').get(entry.scope);
      owner.onsuccess = () => {
        if (!owner.result?.sessionValid) return;
        claimed = { ...entry, status: 'SYNCING', attempts: entry.attempts + 1, leaseUntil: now + 120_000, leaseId: crypto.randomUUID() };
        try { outbox.put(claimed); } catch (error) { reject(error); tx.abort(); }
      };
    };
    tx.oncomplete = () => resolve(claimed);
    tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error ?? new Error('Payment claim interrupted'));
  });
}

/** Atomic against the service worker claim and voluntary sign-out. */
export async function requestOutboxCancellation(scope, key, cancellation) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['accounts', 'outbox'], 'readwrite'); let result; let failure;
    const owner = tx.objectStore('accounts').get(scope);
    owner.onsuccess = () => {
      if (!owner.result?.sessionValid) { failure = new Error('Sign in again before cancelling'); tx.abort(); return; }
      const outbox = tx.objectStore('outbox'); const request = outbox.get(key);
      request.onsuccess = () => {
        const current = request.result;
        if (!current || current.scope !== scope || current.action !== 'RECORD_PAYMENT' || current.reviewId || current.receipt || current.cancellation
            || !['QUEUED','RETRYABLE_FAILURE','PAUSED_ACCESS','AUTH_REQUIRED','FAILED','CONFLICT'].includes(current.status)) {
          failure = new Error('This payment started syncing or is already on the server. Refresh its details; received payments use Void in History.'); tx.abort(); return;
        }
        result = { ...current, cancellation, status: current.attempts === 0 ? 'CANCELLED' : 'QUEUED', nextAttemptAt: 0,
          errorMessage: current.attempts === 0 ? 'Cancelled before sending. No money collected.' : 'Cancellation waiting for server verification.' };
        try { outbox.put(result); } catch (error) { failure = error; tx.abort(); }
      };
    };
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(failure ?? tx.error); tx.onabort = () => reject(failure ?? tx.error ?? new Error('Cancellation interrupted'));
  });
}

/** Account validation and insertion must be atomic with voluntary sign-out. */
export async function saveOutboxForAccount(account, draft) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['accounts', 'outbox'], 'readwrite');
    let result; let error;
    const owner = tx.objectStore('accounts').get(account.scope);
    owner.onsuccess = () => {
      if (!owner.result?.sessionValid || owner.result.generation !== account.generation) {
        error = new Error('Account session changed before the payment was saved'); tx.abort(); return;
      }
      const outbox = tx.objectStore('outbox'); const request = outbox.get(draft.key);
      request.onsuccess = () => {
        if (request.result && request.result.businessHash !== draft.businessHash) {
          error = new Error('Payment operation already has different details'); tx.abort(); return;
        }
        try {
          result = request.result ?? draft;
          if (!request.result) outbox.add(result);
        } catch (failure) { error = failure; tx.abort(); }
      };
    };
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(error ?? tx.error); tx.onabort = () => reject(error ?? tx.error ?? new Error('Payment save interrupted'));
  });
}

/** Mark sessions locked and discard unconfirmed work in one cross-tab transaction. */
export async function discardOutboxAndLockAccounts(scopes, shouldDiscard) {
  const selected = new Set(scopes); const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['accounts', 'outbox'], 'readwrite');
    const accounts = tx.objectStore('accounts');
    for (const scope of selected) {
      const request = accounts.get(scope);
      request.onsuccess = () => { if (request.result) accounts.put({ ...request.result, sessionValid: false, generation: (request.result.generation ?? 0) + 1 }); };
    }
    const request = tx.objectStore('outbox').openCursor();
    request.onsuccess = () => {
      const cursor = request.result; if (!cursor) return;
      if (selected.has(cursor.value.scope) && shouldDiscard(cursor.value)) cursor.delete();
      cursor.continue();
    };
    tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Sign-out storage update interrupted'));
  });
}

/** Commit a page, its identities, and its resume checkpoint together. */
export async function commitDatasetChunk(rows, uniqueKeys) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('datasets', 'readwrite');
    const store = tx.objectStore('datasets');
    let error;
    let remaining = uniqueKeys.length;
    const put = () => { for (const row of rows) store.put(row); };
    if (!remaining) put();
    for (const key of uniqueKeys) {
      const request = store.getKey(key);
      request.onsuccess = () => {
        if (request.result != null) {
          error = new Error('This list changed between download pages. Preparation will retry.');
          tx.abort(); return;
        }
        if (--remaining === 0) put();
      };
    }
    tx.oncomplete = resolve;
    tx.onerror = () => reject(error ?? tx.error);
    tx.onabort = () => reject(error ?? tx.error ?? new Error('Download storage was interrupted'));
  });
}

/** Delete obsolete journals by key without loading encrypted datasets into memory. */
export async function deletePrefixExcept(storeName, prefix, retainedPrefixes) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const request = tx.objectStore(storeName).openKeyCursor(IDBKeyRange.bound(prefix, prefix + '\uffff'));
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      if (!retainedPrefixes.some((value) => String(cursor.primaryKey).startsWith(value))) tx.objectStore(storeName).delete(cursor.primaryKey);
      cursor.continue();
    };
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Storage cleanup was interrupted'));
  });
}
