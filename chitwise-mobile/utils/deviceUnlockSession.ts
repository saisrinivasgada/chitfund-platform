/** Device approvals last only for the current foreground visit, never across app restarts. */
let snapshot = { accounts: new Set<string>(), epoch: 0 };
const listeners = new Set<() => void>();
export const getDeviceUnlockSession = () => snapshot;
export function subscribeDeviceSession(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function authorizeDeviceSession(accountId: string) {
  snapshot = { ...snapshot, accounts: new Set([...snapshot.accounts, accountId]) };
  listeners.forEach((listener) => listener());
}
export function invalidateDeviceSession() {
  snapshot = { accounts: new Set(), epoch: snapshot.epoch + 1 };
  listeners.forEach((listener) => listener());
}
