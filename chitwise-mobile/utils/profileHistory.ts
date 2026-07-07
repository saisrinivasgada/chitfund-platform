import AsyncStorage from '@react-native-async-storage/async-storage';

const MAX_ENTRIES = 20;

function storageKey(userId: string) {
  return `cf_profile_history_${userId}`;
}

export interface HistoryChange {
  field: string;
  from: string;
  to: string;
}

export interface HistoryEntry {
  id: string;
  at: string;
  changes: HistoryChange[];
}

export async function recordProfileChange(userId: string, changes: HistoryChange[]) {
  if (!userId || !changes?.length) return;
  try {
    const raw = await AsyncStorage.getItem(storageKey(userId));
    const existing: HistoryEntry[] = raw ? JSON.parse(raw) : [];
    const entry: HistoryEntry = { id: String(Date.now()), at: new Date().toISOString(), changes };
    await AsyncStorage.setItem(storageKey(userId), JSON.stringify([entry, ...existing].slice(0, MAX_ENTRIES)));
  } catch {}
}

export async function getProfileHistory(userId: string): Promise<HistoryEntry[]> {
  if (!userId) return [];
  try {
    const raw = await AsyncStorage.getItem(storageKey(userId));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
