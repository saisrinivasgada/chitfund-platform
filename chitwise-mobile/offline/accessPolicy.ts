export interface OfflineGrant {
  id: string;
  actorId: string;
  tenantId: string;
  role: string;
  issuedAt: number;
  recordUntil: number;
  actions: string[];
  token: string;
}

export interface OfflineAccess {
  enabled: boolean;
  reason: string | null;
  tenantId: string;
  actorId: string;
  role: string;
  serverTime: number;
  grant: OfflineGrant | null;
  checkedAt: number;
}

export function belongsToAccount(
  access: OfflineAccess | undefined,
  account: { userId: string; tenantId?: string; role: string },
): access is OfflineAccess {
  return !!access && access.actorId === account.userId && access.tenantId === account.tenantId
    && access.role === account.role;
}

export function canRecordOffline(access: OfflineAccess | undefined, action: string, now = Date.now()): boolean {
  if (!access?.enabled || !access.grant || !Number.isFinite(access.checkedAt)
      || !Number.isFinite(access.serverTime) || now < access.checkedAt) return false;
  const serverNow = access.serverTime + (now - access.checkedAt);
  return serverNow >= access.grant.issuedAt && serverNow < access.grant.recordUntil
    && access.grant.actions.includes(action);
}

export function requireOfflineRecording(access: OfflineAccess | undefined, action: string, now = Date.now()): OfflineGrant {
  if (!access?.enabled) throw new Error('Offline access & sync is not enabled for this organisation. Connect to continue.');
  if (!canRecordOffline(access, action, now)) {
    throw new Error('Connect to verify access before recording another offline payment. Your saved payments are preserved.');
  }
  return access.grant!;
}
