export type ReadViewState = 'ready' | 'loading' | 'unavailable' | 'restricted';
export interface ReadQueryState { data?: unknown; status?: string; fetchStatus?: string; error?: unknown }
export function readViewState(states: (ReadQueryState | undefined)[]): ReadViewState;
export function createReadViewObserver(client: {
  getQueryCache(): {
    get(hash: string): { state: ReadQueryState } | undefined;
    subscribe(listener: (event: { query: { queryHash: string } }) => void): () => void;
  };
  refetchQueries(filters: { predicate: (query: { queryHash: string }) => boolean; type: 'active' }): Promise<unknown>;
}, hashes: string[]): {
  getSnapshot(): ReadViewState;
  subscribe(notify: () => void): () => void;
  retry(): Promise<unknown>;
};
