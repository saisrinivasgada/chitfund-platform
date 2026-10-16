export interface OfflineGrant {
  id: string; actorId: string; tenantId: string; role: string; issuedAt: number;
  recordUntil: number; readUntil?: number; actions: string[]; token: string;
}
export interface OfflineAccess {
  enabled: boolean; reason: string | null; tenantId: string; actorId: string; role: string;
  serverTime: number; grant: OfflineGrant | null; checkedAt: number;
}
export function belongsToAccount(access: OfflineAccess | undefined,
  account: { userId: string; tenantId?: string; role: string }): access is OfflineAccess;
export function canRecordOffline(access: OfflineAccess | undefined, action: string, now?: number): boolean;
export function recordingPauseMessage(access: OfflineAccess | undefined, now?: number): string;
export function requireOfflineRecording(access: OfflineAccess | undefined, action: string, now?: number): OfflineGrant;
