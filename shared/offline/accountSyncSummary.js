/** Labels describe only this account's device queue and preparation state. */
export function accountSyncSummary({ counts, sessionValid, online = true, syncing = false, locked = false, preparation } = {}) {
  if (locked) return { state: 'attention', label: 'Saved records are locked', detail: 'Unlock the device to check its saved collections.' };
  if (!counts) return { state: 'checking', label: 'Checking saved collections…', detail: '' };
  const pending = counts.pending ?? 0;
  const reviews = (counts.conflicts ?? 0) + (counts.failed ?? 0);
  const total = pending + reviews;
  if (!sessionValid && total) return { state: 'attention', label: `Sign in to sync · ${total} saved`, detail: 'Saved collections remain preserved for this account.' };
  if (syncing || counts.syncing) return { state: 'syncing', label: 'Syncing saved collections…', detail: reviews ? `${reviews} also need review` : 'You can switch accounts; delivery keeps its original account.' };
  if (reviews) return { state: 'attention', label: `${reviews} ${reviews === 1 ? 'collection needs' : 'collections need'} review`, detail: pending ? `${pending} more waiting to sync` : 'Open this organisation to review the saved transactions.' };
  if (pending) return { state: 'waiting', label: `${pending} saved · ${online ? 'waiting to sync' : 'offline'}`, detail: counts.paused ? 'Account access needs to be verified; saved money is preserved.' : 'Use Sync now or let syncing resume when connected.' };
  if (preparation?.status === 'preparing') return { state: 'syncing', label: 'Downloading offline data…', detail: 'Completed chunks stay saved if the connection drops.' };
  if (preparation?.status === 'paused') return { state: 'waiting', label: 'Data download paused', detail: 'No collections waiting. Remaining chunks will resume.' };
  return { state: 'ready', label: 'No collections waiting to sync', detail: preparation?.status === 'ready' ? 'Offline data is saved on this device.' : '' };
}
