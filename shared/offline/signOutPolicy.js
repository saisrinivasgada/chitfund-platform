/** Only unconfirmed device work is discarded. Server receipts/reviews survive. */
export function isUnsentCollection(entry) {
  return !['SUCCEEDED', 'CANCELLED'].includes(entry.status)
    && !(entry.reviewId ?? entry.serverReviewId)
    && !(entry.serverReceiptId ?? entry.receiptId);
}

export function signOutWarning(count, all = false) {
  const target = all ? 'these accounts' : 'this account';
  return count > 0
    ? `${count} unsynced payment${count === 1 ? '' : 's'} will be permanently deleted from this device if you sign out of ${target}. Signing in again will not restore ${count === 1 ? 'it' : 'them'}. Payments already received by the server will remain. Continue signing out?`
    : `Sign out of ${target}? Payments already received by the server will remain.`;
}
