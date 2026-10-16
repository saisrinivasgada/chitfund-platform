import { useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { getAccountScope } from './accountScope';
import { useOfflineAccessStore } from './access';
import { prepareOfflineData } from './preparation';

// Durable HTTP preparation replaces transient, active-session prefetch callbacks.
// Every request is pinned to the scope captured when the preparation starts.
function useStartupPreparation() {
  const user = useAuthStore((state) => state.user);
  const scope = getAccountScope(user);
  const enabled = useOfflineAccessStore((state) => !!scope && state.accounts[scope]?.enabled === true);
  useEffect(() => {
    if (!scope || !enabled || user?.authSource === 'HUB') return;
    prepareOfflineData(scope, { deadline: Date.now() + 60_000 }).catch(() => {});
  }, [scope, enabled, user?.authSource]);
}

export const useAdminStartupPrefetch = useStartupPreparation;
export const useManagerStartupPrefetch = useStartupPreparation;
export const useStaffStartupPrefetch = useStartupPreparation;
export const useMemberStartupPrefetch = useStartupPreparation;
