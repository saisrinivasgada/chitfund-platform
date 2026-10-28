export interface PreparationManifest {
  cycle: string; role: string; phase: string; rootsDone: string[]; status: string;
  startedAt: number; lastCompleteAt: number | null; completed: number; total: number;
  seeded?: Record<string, number>; detailsDone?: number; message?: string; membersCount?: number; chitsCount?: number; batchesCount?: number;
}
export interface PreparationJob { key: string; path: string; params: Record<string, unknown>; kind?: string; memberId?: string }
export interface PreparationAdapter {
  role: string; requiresRootSnapshots?: boolean; newId(): string; loadManifest(): Promise<PreparationManifest | null>; claimLease(): Promise<string | null>;
  saveManifest(manifest: PreparationManifest, lease: string): Promise<PreparationManifest>;
  releaseLease(lease: string): Promise<void>; cleanOldWork(cycle: string): Promise<void>; canContinue(): Promise<boolean>;
  loadRoot(cycle: string, kind: string): Promise<any>; saveRoot(cycle: string, kind: string, state: any): Promise<void>;
  commitRootChunk?(cycle: string, kind: string, chunk: number, records: any[], state: any): Promise<void>;
  loadRootChunk?(cycle: string, kind: string, chunk: number): Promise<any[]>;
  request(path: string, params: Record<string, unknown>, snapshotVersion?: string): Promise<any>;
  saveResponse(path: string, params: Record<string, unknown>, response: any): Promise<void>;
  publish(kind: string, records: any[] | { format: string; cycle: string; kind: string; chunks: number; count: number; snapshotStartedAt?: number }): Promise<void>; addJobs(cycle: string, jobs: PreparationJob[]): Promise<void>;
  nextJobs(cycle: string, limit: number): Promise<PreparationJob[]>;
  finishJob(cycle: string, key: string): Promise<void>; failJob(cycle: string, key: string, message: string): Promise<void>;
  jobCounts(cycle: string): Promise<{ total: number; done: number; pending: number }>;
}
export function prepareCoreData(adapter: PreparationAdapter, options?: { force?: boolean; maxRequests?: number; deadline?: number }): Promise<PreparationManifest | null>;
