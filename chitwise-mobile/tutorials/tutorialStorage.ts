import AsyncStorage from '@react-native-async-storage/async-storage';
import type { UserRole } from '../store/authStore';

export type TutorialPreference = 'unset' | 'enabled' | 'disabled';

export interface TutorialState {
  schemaVersion: 1;
  preference: TutorialPreference;
  completedPages: Record<string, number>;
}

const DEFAULT_STATE: TutorialState = {
  schemaVersion: 1,
  preference: 'unset',
  completedPages: {},
};

function storageKey(userId: string, role: UserRole) {
  return `@chitwise/tutorials/v1/${userId}/${role}`;
}

export async function loadTutorialState(userId: string, role: UserRole): Promise<TutorialState> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(userId, role));
    if (!raw) return { ...DEFAULT_STATE, completedPages: {} };

    const parsed = JSON.parse(raw) as Partial<TutorialState>;
    const preference = parsed.preference;
    if (preference !== 'unset' && preference !== 'enabled' && preference !== 'disabled') {
      return { ...DEFAULT_STATE, completedPages: {} };
    }

    return {
      schemaVersion: 1,
      preference,
      completedPages: parsed.completedPages && typeof parsed.completedPages === 'object'
        ? parsed.completedPages
        : {},
    };
  } catch {
    return { ...DEFAULT_STATE, completedPages: {} };
  }
}

export async function saveTutorialState(userId: string, role: UserRole, state: TutorialState) {
  await AsyncStorage.setItem(storageKey(userId, role), JSON.stringify(state));
}
