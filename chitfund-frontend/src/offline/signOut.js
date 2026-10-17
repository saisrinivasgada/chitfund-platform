import { isUnsentCollection } from '../../../shared/offline/signOutPolicy';
import { readRows, discardOutboxAndLockAccounts } from './storage';
import { lockAccount } from './accountClient';
import { notifyOfflineChange } from './outbox';

export async function inspectSignOut(scope, all = false) {
  if (!scope && !all) return { accounts: [], scopes: [], count: 0 };
  const accounts = await readRows('accounts');
  const owner = accounts.find((a) => a.scope === scope);
  // Older role scopes belong to the same login, but another org/user never does.
  const selected = accounts.filter((a) => all || (owner && a.user.id === owner.user.id && a.tenant.tenantId === owner.tenant.tenantId));
  const scopes = selected.map((a) => a.scope);
  const count = (await readRows('outbox')).filter((e) => scopes.includes(e.scope) && isUnsentCollection(e)).length;
  return { accounts: selected, scopes, count };
}

/** Caller must show the warning and obtain explicit destructive confirmation. */
export async function completeVoluntarySignOut(selection) {
  if (selection.scopes.length) await discardOutboxAndLockAccounts(selection.scopes, isUnsentCollection);
  for (const account of selection.accounts) {
    await lockAccount(account.scope);
    notifyOfflineChange(account.scope);
    if (account.browserAccountId) fetch(`/api/auth/accounts/${account.browserAccountId}/logout`, {
      method: 'POST', credentials: 'include', headers: { 'X-Client-Source': 'WEB' },
    }).catch(() => {});
  }
}
