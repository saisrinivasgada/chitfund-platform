export function requestKey(path: string, params?: Record<string, unknown>): string;
export function cacheableRead(path: string, method?: string): boolean;
export function shouldRetryRead(failureCount: number, error: unknown, maximum?: number): boolean;
export function mayKeepReadSnapshot(error: unknown): boolean;
export function listSnapshot(kind: string, records: any[], params?: Record<string, unknown>):
  { success: boolean; data: { content: any[]; number: number; size: number; totalElements: number; totalPages: number; last: boolean } } | null;
export function batchSnapshot(records: any[], params?: Record<string, unknown>):
  { success: boolean; data: any[] | { content: any[]; totalElements: number; page: number; size: number; hasMore: boolean } } | null;
