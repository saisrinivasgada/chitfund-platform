import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { accountScope } from './accountClient';
import { readRow } from './storage';
import { offlinePresentation } from '../../../shared/offline/presentation';
import OfflineStatus from './OfflineStatus';

export default function OfflineConnectionGate({ children }) {
  const auth = useAuth();
  const scope = !auth.isProxySession ? accountScope(auth.user, auth.tenantId) : null;
  const [online, setOnline] = useState(navigator.onLine);
  const [saved, setSaved] = useState(null);
  useEffect(() => {
    let active = true;
    const update = () => {
      if (scope) readRow('accounts', scope).then((row) => { if (active) setSaved(row); }).catch(() => {});
    };
    const network = () => {
      setOnline(navigator.onLine); update();
      if (navigator.onLine && auth.connectionRequired) window.location.reload();
    };
    const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('chitwise-offline');
    if (channel) channel.onmessage = update;
    window.addEventListener('online', network); window.addEventListener('offline', network);
    update();
    return () => { active = false; channel?.close(); window.removeEventListener('online', network); window.removeEventListener('offline', network); };
  }, [scope, auth.connectionRequired]);
  const account = auth.connectionRequired ?? (saved?.scope === scope ? saved : null);
  const { showSync, notSubscribed } = offlinePresentation(account?.offlineAccess, account?.tenant?.offlineEnabled);
  if (!auth.connectionRequired && (online || !scope || auth.isRestoring || showSync)) return children;

  return <main className="min-h-screen bg-slate-50 px-6 py-10 flex items-center justify-center">
    <section className="w-full max-w-md rounded-3xl bg-white border border-slate-200 p-8 shadow-sm text-center" aria-label="Connection required">
      <div className="mx-auto mb-6 h-20 w-20 rounded-3xl bg-slate-100 text-[#1E3A5F] flex items-center justify-center"><WifiOff size={34} /></div>
      <h1 className="text-2xl font-bold text-[#1E3A5F]">{online ? 'Unable to connect' : 'No internet connection'}</h1>
      <p className="mt-4 text-sm leading-6 text-slate-600">{notSubscribed
        ? 'Your organisation hasn’t subscribed to Offline access & sync. Connect to the internet to continue.'
        : 'Connect to the internet to verify offline access for this account.'}</p>
      <button className="mt-6 mb-4 w-full rounded-xl bg-[#1E3A5F] py-3 text-sm font-semibold text-white" onClick={() => window.location.reload()}>Try again</button>
      <OfflineStatus connectionScreen />
    </section>
  </main>;
}
