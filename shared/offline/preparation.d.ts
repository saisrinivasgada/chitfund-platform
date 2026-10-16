export interface PreparationManifest {
  cycle: string; role: string; phase: string; rootsDone: string[]; status: string;
  startedAt: number; lastCompleteAt: number | null; completed: number; total: number;
  detailsDone?: number; message?: string; membersCount?: number; chitsCount?: number; batchesCount?: number;
}
export interface PreparationJob { key: string; path: string; params: Record<string, unknown>; kind?: string; memberId?: string }
export interface PreparationAdapter {
  role: string; newId(): string; loadManifest(): Promise<PreparationManifest | null>; claimLease(): Promise<string | null>;
  saveManifest(manifest: PreparationManifest, lease: string): Promise<PreparationManifest>;
  releaseLease(lease: string): Promise<void>; cleanOldWork(cycle: string): Promise<void>; canContinue(): Promise<boolean>;
  loadRoot(cycle: string, kind: string): Promise<any>; saveRoot(cycle: string, kind: string, state: any): Promise<void>;
  request(path: string, params: Record<string, unknown>): Promise<any>;
  saveResponse(path: string, params: Record<string, unknown>, response: any): Promise<void>;
  publish(kind: string, records: any[]): Promise<void>; addJobs(cycle: string, jobs: PreparationJob[]): Promise<void>;
  nextJobs(cycle: string, limit: number): Promise<PreparationJob[]>;
  finishJob(cycle: string, key: string): Promise<void>; failJob(cycle: string, key: string, message: string): Promise<void>;
  jobCounts(cycle: string): Promise<{ total: number; done: number; pending: number }>;
}
export function prepareCoreData(adapter: PreparationAdapter, options?: { force?: boolean; maxRequests?: number; deadline?: number }): Promise<PreparationManifest | null>;
