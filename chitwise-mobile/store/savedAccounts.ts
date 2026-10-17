/** A damaged account index must never be treated as an empty, writable index. */
export function decodeSavedAccounts(raw: string | null): Record<string, unknown>[] {
  if (raw === null) return [];
  let accounts: unknown;
  try { accounts = JSON.parse(raw); }
  catch { throw new Error('Saved accounts could not be read. Restart the app before signing in again. Your saved payments have not been deleted.'); }
  if (!Array.isArray(accounts) || accounts.some((account) => !account || typeof account !== 'object'
      || typeof account.userId !== 'string' || !account.userId || typeof account.role !== 'string' || !account.role)) {
    throw new Error('Saved accounts need recovery. Your saved payments have not been deleted.');
  }
  return accounts;
}
