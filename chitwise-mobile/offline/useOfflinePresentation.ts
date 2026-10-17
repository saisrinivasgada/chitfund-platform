import { offlinePresentation } from '../../shared/offline/presentation';
import { useAuthStore } from '../store/authStore';
import { effectiveOfflineAccess } from './accessPolicy';
import { getAccountScope, getStoredAccountScope } from './accountScope';
import { useOfflineAccessStore } from './access';

export function useOfflinePresentation() {
  const user = useAuthStore((state) => state.user);
  const scope = getAccountScope(user);
  const access = useOfflineAccessStore((state) => scope ? state.accounts[scope] : undefined);
  const account = useAuthStore((state) => state.accounts.find((saved) => getStoredAccountScope(saved) === scope));
  return offlinePresentation(effectiveOfflineAccess(access, account?.offlineEnabled, account?.offlineSubscriptionCheckedAt ?? account?.savedAt), user?.offlineEnabled);
}
