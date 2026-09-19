import { create } from 'zustand';
import type { SyncStatus } from '../offline/types';

interface SyncState {
  accountScope: string | null;
  status: SyncStatus;
  isOnline: boolean;
  pendingCount: number;
  conflictCount: number;
  failedCount: number;
  lastSyncedAt: number | null;
  message: string | null;
  setStateForScope: (scope: string | null, values: Partial<Omit<SyncState, 'setStateForScope'>>) => void;
  resetForScope: (scope: string | null) => void;
}

export const useSyncStore = create<SyncState>((set, get) => ({
  accountScope: null,
  status: 'synced',
  isOnline: true,
  pendingCount: 0,
  conflictCount: 0,
  failedCount: 0,
  lastSyncedAt: null,
  message: null,
  setStateForScope: (scope, values) => {
    if (get().accountScope !== scope) return;
    set(values);
  },
  resetForScope: (scope) => set({
    accountScope: scope,
    status: 'synced',
    isOnline: true,
    pendingCount: 0,
    conflictCount: 0,
    failedCount: 0,
    lastSyncedAt: null,
    message: null,
  }),
}));
