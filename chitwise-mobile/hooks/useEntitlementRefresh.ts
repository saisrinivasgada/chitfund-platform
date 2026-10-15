import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { getMyEffectiveLimits } from '../services/api';
import { useAuthStore } from '../store/authStore';

/** Keeps successful client add-on hints current; APIs remain authoritative. */
export function useEntitlementRefresh() {
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);
  const enabled = user?.authSource !== 'HUB' && !!user?.tenantId;
  const query = useQuery({
    queryKey: ['my-effective-limits', user?.tenantId],
    queryFn: getMyEffectiveLimits,
    enabled,
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: false,
  });

  useEffect(() => {
    if (!enabled) return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') query.refetch();
    });
    return () => subscription.remove();
  }, [enabled, query.refetch]);

  useEffect(() => {
    const limits = query.data as any;
    if (!user || !limits) return;
    const next = {
      analyticsEnabled: limits.analyticsEnabled === true,
      chatEnabled: limits.chatEnabled === true,
      settlementEnabled: limits.settlementEnabled === true,
    };
    if (user.analyticsEnabled === next.analyticsEnabled
        && user.chatEnabled === next.chatEnabled
        && user.settlementEnabled === next.settlementEnabled) return;
    void setUser({ ...user, ...next });
  }, [query.data, setUser, user]);
}
