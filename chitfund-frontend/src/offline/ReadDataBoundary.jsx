import { useMemo, useState, useSyncExternalStore } from 'react';
import { hashKey, useQueryClient } from '@tanstack/react-query';
import { CloudDownload, Loader2 } from 'lucide-react';
import { createReadViewObserver } from '../../../shared/offline/readViewState';
import Button from '../components/ui/Button';

export default function ReadDataBoundary({ queryKeys, label, children, compact = false }) {
  const client = useQueryClient();
  const signature = JSON.stringify(queryKeys.map(hashKey));
  const observer = useMemo(() => createReadViewObserver(client, JSON.parse(signature)), [client, signature]);
  const state = useSyncExternalStore(observer.subscribe, observer.getSnapshot, observer.getSnapshot);
  const [busy, setBusy] = useState(false);
  if (state === 'ready') return children;
  if (compact) return <span aria-label={`${label} ${state === 'loading' ? 'loading' : 'unavailable'}`} className="text-xs text-slate-500">{state === 'loading' ? '…' : state === 'restricted' ? 'Access needed' : 'Unavailable'}</span>;
  if (state === 'loading') return <div role="status" className="flex items-center justify-center gap-3 py-16 text-sm text-slate-500"><Loader2 className="animate-spin" size={20} />Loading {label.toLowerCase()}…</div>;
  return <div data-testid="read-unavailable" role="alert" className="rounded-2xl border border-slate-200 bg-slate-50 px-6 py-14 text-center">
    <CloudDownload size={36} className="mx-auto mb-4 text-[#1E3A5F]" />
    <h2 className="text-xl font-bold text-[#1E3A5F]">{label} unavailable</h2>
    <p className="mx-auto mt-3 mb-6 max-w-md text-sm leading-6 text-slate-600">{state === 'restricted'
      ? 'Connect to verify access and refresh this information before continuing.'
      : 'We could not load this information. Check your connection and try again.'}</p>
    <Button loading={busy} onClick={async () => {
      setBusy(true);
      try { await observer.retry(); } catch { /* Keep the notice until the read succeeds. */ }
      finally { setBusy(false); }
    }}>Try again</Button>
  </div>;
}
