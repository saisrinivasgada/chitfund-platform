/** Missing or malformed data is unknown, never a cleared balance. */
export function outstandingValue(balance) {
  const value = typeof balance === 'number' || typeof balance === 'string' ? balance
    : balance?.totalOutstanding ?? balance?.outstandingBalance ?? balance?.balance;
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  return (typeof value === 'string' && !value.trim()) || !Number.isFinite(Number(value)) ? null : Number(value);
}
