import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { activeAccountScope, accountScope, refreshOfflineAccess } from './accountClient';
import { notifyOfflineChange, syncSavedPayments } from './outbox';
import { readRows } from './storage';
import { prepareOfflineData } from './preparation';

async function registerOfflineWorker() {
  if (!('serviceWorker' in navigator)) return;
  const accounts = await readRows('accounts');
  const pending = (await readRows('outbox')).filter((entry) => !['SUCCEEDED', 'CANCELLED'].includes(entry.status));
  // The app shell can explain missing connectivity even without the add-on.
  // Business snapshots remain entitlement-gated and encrypted separately.
  if (!accounts.some((account) => account.sessionValid)) return;
  const registration = await navigator.serviceWorker.register('/offline-worker.js', { type: 'module' });
  if (registration.sync && pending.some((entry) => accounts.some((account) => account.sessionValid && account.scope === entry.scope))) await registration.sync.register('chitwise-payments');
}

export default function OfflineRuntime() {
  const { user, tenantId, isProxySession } = useAuth();
  const queryClient = useQueryClient();
  const scope = !isProxySession ? accountScope(user, tenantId) : null;

  useEffect(() => {
    let active = true;
    let running = false;
    const synchronize = async () => {
      if (!navigator.onLine || running) return;
      running = true;
      try {
        // Financial delivery has priority over preparing read-only data.
        await syncSavedPayments();
        const deadline = Date.now() + 60_000;
        const accounts = (await readRows('accounts')).filter((account) => account.sessionValid)
          .sort((a, b) => Number(b.scope === scope) - Number(a.scope === scope));
        for (const account of accounts) {
          if (!active || !scope || Date.now() >= deadline || !navigator.onLine) break;
          try {
            if (!account.offlineAccess || Date.now() - account.offlineAccess.checkedAt >= 60_000) {
              await refreshOfflineAccess(account.scope);
            }
            notifyOfflineChange(account.scope);
            await prepareOfflineData(account.scope, { deadline });
          } catch { /* Durable checkpoints resume on the next connection/run. */ }
        }
        await registerOfflineWorker();
        if (active && scope && activeAccountScope() === scope
            && accounts.some((account) => account.scope === scope && account.offlineAccess?.enabled)) {
          await queryClient.invalidateQueries({ refetchType: 'active' });
        }
      } finally { running = false; }
    };
    synchronize().catch(() => {});
    const onOnline = () => { synchronize().catch(() => {}); };
    const onVisible = () => { if (document.visibilityState === 'visible') onOnline(); };
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisible);
    const timer = setInterval(() => { if (document.visibilityState === 'visible') onOnline(); }, 20_000);
    return () => {
      active = false; clearInterval(timer);
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [scope, queryClient]);
  return null;
}
