const MAX_ENTRIES = 20;

function storageKey(userId) {
  return `cf_profile_history_${userId}`;
}

export function recordProfileChange(userId, changes) {
  if (!userId || !changes?.length) return;
  try {
    const existing = JSON.parse(localStorage.getItem(storageKey(userId)) ?? '[]');
    const entry = { id: String(Date.now()), at: new Date().toISOString(), changes };
    localStorage.setItem(storageKey(userId), JSON.stringify([entry, ...existing].slice(0, MAX_ENTRIES)));
  } catch { /* ignore storage errors */ }
}

export function getProfileHistory(userId) {
  if (!userId) return [];
  try {
    return JSON.parse(localStorage.getItem(storageKey(userId)) ?? '[]');
  } catch {
    return [];
  }
}
