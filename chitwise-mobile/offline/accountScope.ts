import { accountStorageId, AuthUser, StoredAccount } from '../store/authStore';

export function getAccountScope(user: AuthUser | null | undefined): string | null {
  if (!user) return null;
  return `${accountStorageId(user.id, user.tenantId, user.authSource ?? 'ORGANIZATION')}:${user.role}`;
}

export function getStoredAccountScope(account: StoredAccount): string {
  return `${account.accountId}:${account.role}`;
}

export function requireOrganizationScope(user: AuthUser | null | undefined): {
  scope: string;
  tenantId: string;
  actorId: string;
} {
  if (!user || user.authSource === 'HUB' || !user.tenantId) {
    throw new Error('An active organization account is required');
  }
  return {
    scope: getAccountScope(user)!,
    tenantId: user.tenantId,
    actorId: user.id,
  };
}
