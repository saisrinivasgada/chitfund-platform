import { Text } from 'react-native';
import { useIsFetching, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { useSyncStore } from '../store/syncStore';
import { useAuthStore } from '../store/authStore';
import { getAccountScope } from '../offline/accountScope';
import { httpCacheFreshness } from '../offline/httpCache';

const PATHS: Record<string, string> = {
  'm-cash-summary': '/payments/requests/summary', 'm-cash-requests': '/payments/requests/active',
  'cash-requests': '/payments/requests/active', 'pending-remit': '/payments/pending-remittance',
  'manager-pickups': '/payments/requests/mine',
  'm-dash-remittance': '/payments/pending-remittance', 'm-today-batches': '/payments/batches/today',
};

export function OfflineSnapshotLabel({ queryKey }: { queryKey: QueryKey }) {
  const online = useSyncStore((state) => state.isOnline);
  const client = useQueryClient();
  const scope = getAccountScope(useAuthStore((state) => state.user));
  useIsFetching({ queryKey, exact: true });
  const state = client.getQueryState(queryKey);
  const freshness = scope && PATHS[String(queryKey[0])] ? httpCacheFreshness(scope, PATHS[String(queryKey[0])]) : null;
  if (online && !state?.error && !freshness?.servedFromCache) return null;
  const updatedAt = freshness?.savedAt ?? state?.dataUpdatedAt;
  const time = updatedAt ? new Date(updatedAt).toLocaleTimeString('en-IN', {
    hour: 'numeric', minute: '2-digit',
  }) : null;
  return <Text style={{ fontSize: 10, color: '#64748B', marginTop: 5 }}>
    {online ? 'Saved snapshot' : 'Offline'} · {state?.data === undefined ? 'not downloaded' : time ?? 'saved snapshot'}
  </Text>;
}
