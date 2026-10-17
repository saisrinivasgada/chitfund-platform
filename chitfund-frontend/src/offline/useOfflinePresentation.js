import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { accountScope } from './accountClient';
import { readRow } from './storage';
import { offlinePresentation } from '../../../shared/offline/presentation';

export function useOfflinePresentation() {
  const auth = useAuth();
  const scope = !auth.isProxySession ? accountScope(auth.user, auth.tenantId) : null;
  const [account, setAccount] = useState(null);
  useEffect(() => {
    let active = true;
    const update = () => { if (scope) readRow('accounts', scope).then((row) => { if (active) setAccount(row); }).catch(() => {}); };
    const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('chitwise-offline');
    if (channel) channel.onmessage = update;
    update(); const timer = setInterval(update, 10_000);
    return () => { active = false; clearInterval(timer); channel?.close(); };
  }, [scope]);
  return offlinePresentation(account?.scope === scope ? account.offlineAccess : null, account?.scope === scope ? account.tenant?.offlineEnabled : undefined);
}
