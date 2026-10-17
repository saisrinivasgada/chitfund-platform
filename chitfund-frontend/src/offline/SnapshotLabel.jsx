import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { accountScope } from './accountClient';
import { cachedDataState } from './cache';

export default function SnapshotLabel({ path, available = true }) {
  const { user, tenantId } = useAuth();
  const scope = accountScope(user, tenantId);
  const [online, setOnline] = useState(navigator.onLine);
  const [freshness, setFreshness] = useState(() => cachedDataState(scope, path));
  useEffect(() => {
    const network = () => setOnline(navigator.onLine);
    const changed = (event) => {
      if (event.detail.scope === scope && event.detail.path === path) setFreshness(event.detail);
    };
    window.addEventListener('online', network); window.addEventListener('offline', network);
    window.addEventListener('chitwise:cached-read', changed);
    return () => {
      window.removeEventListener('online', network); window.removeEventListener('offline', network);
      window.removeEventListener('chitwise:cached-read', changed);
    };
  }, [path, scope]);
  if (online && !freshness?.servedFromCache) return null;
  const time = freshness?.cachedAt ? new Date(freshness.cachedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : null;
  return <span className="inline-flex mt-1.5 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600"
    title={freshness?.cachedAt ? `Saved snapshot from ${new Date(freshness.cachedAt).toLocaleString()}` : undefined}>
    {online ? 'Saved snapshot' : 'Offline'} · {available ? time ?? 'saved snapshot' : 'not downloaded'}
  </span>;
}
