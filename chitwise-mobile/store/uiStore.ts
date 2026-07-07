import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const ACTIVITY_KEY = 'cf_activity_lastseen';

interface UIState {
  amountsHidden: boolean;
  toggleAmounts: () => void;
  activityBadge: number;
  setActivityBadge: (n: number) => void;
  activityLastSeenAt: string | null;
  markActivitySeen: () => void;
  loadActivityLastSeen: () => Promise<void>;
}

export const useUIStore = create<UIState>((set) => ({
  amountsHidden: false,
  toggleAmounts: () => set((s) => ({ amountsHidden: !s.amountsHidden })),
  activityBadge: 0,
  setActivityBadge: (n) => set({ activityBadge: n }),
  activityLastSeenAt: null,
  markActivitySeen: () => {
    const now = new Date().toISOString();
    AsyncStorage.setItem(ACTIVITY_KEY, now);
    set({ activityBadge: 0, activityLastSeenAt: now });
  },
  loadActivityLastSeen: async () => {
    const v = await AsyncStorage.getItem(ACTIVITY_KEY);
    set({ activityLastSeenAt: v ?? new Date().toISOString() });
  },
}));
