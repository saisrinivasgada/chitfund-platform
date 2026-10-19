import { mayKeepReadSnapshot } from './readSnapshots.js';

/** Undefined means no completed read; an actual empty array is valid data. */
export function readViewState(states) {
  if (states.some((state) => state?.status === 'error' && !mayKeepReadSnapshot(state.error))) return 'restricted';
  const missing = states.filter((state) => state && state.data === undefined);
  if (missing.some((state) => state.status === 'error' || state.fetchStatus === 'paused')) return 'unavailable';
  if (missing.some((state) => state.status === 'pending' && state.fetchStatus === 'fetching')) return 'loading';
  return 'ready';
}

/** Observe only this screen's reads in its account-scoped query client. */
export function createReadViewObserver(client, hashes) {
  const keys = new Set(hashes);
  return {
    getSnapshot: () => readViewState(hashes.map((hash) => client.getQueryCache().get(hash)?.state)),
    subscribe: (notify) => client.getQueryCache().subscribe((event) => {
      if (keys.has(event.query.queryHash)) notify();
    }),
    retry: () => client.refetchQueries({ predicate: (query) => keys.has(query.queryHash), type: 'active' }),
  };
}
