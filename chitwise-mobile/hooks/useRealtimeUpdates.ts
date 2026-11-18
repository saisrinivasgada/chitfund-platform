import { useEffect } from 'react';
import { Client } from '@stomp/stompjs';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../store/authStore';

const apiGateway = new URL(process.env.EXPO_PUBLIC_API_URL
  ?? (__DEV__ ? 'http://localhost:8080/api' : 'https://thechitwise.com/api'));
apiGateway.protocol = apiGateway.protocol === 'https:' ? 'wss:' : 'ws:';
apiGateway.pathname = '/ws-native';
apiGateway.search = '';
const WS_URL = apiGateway.toString();

// Maps WS event type → React Query keys to invalidate
const INVALIDATIONS: Record<string, string[][]> = {
  CASH_REQUESTS_UPDATED: [
    ['m-cash-requests'],
    ['staff-tasks'],
    ['worker-pending-batches'],
    ['m-recent-activity'],
  ],
  PAYMENTS_UPDATED: [
    ['m-today-batches'],
    ['m-wallet'],
    ['m-wallet-txns'],
    ['m-recent-activity'],
    ['staff-history'],
  ],
  PAYOUTS_UPDATED: [
    ['m-today-payouts'],
    ['m-wallet'],
    ['m-wallet-txns'],
    ['m-recent-activity'],
  ],
  DRAWS_UPDATED: [
    ['m-today-draws'],
    ['m-chits'],
    ['member-chits'],
    ['m-recent-activity'],
  ],
  TREASURY_UPDATED: [
    ['m-wallet'],
    ['m-wallet-txns'],
    ['m-recent-activity'],
  ],
  IN_APP_UPDATED: [
    ['m-unread'],
    ['m-notifs'],
  ],
  AUCTION_UPDATED: [
    ['m-auctions'],
    ['m-chits'],
    ['member-chits'],
  ],
};

export function useRealtimeUpdates(enabled = true) {
  const qc = useQueryClient();
  const token = useAuthStore((s) => s.user?.token);
  const tenantId = useAuthStore((s) => s.user?.tenantId);

  useEffect(() => {
    if (!enabled || !token || !tenantId) return;

    const pendingKeys = new Map<string, string[]>();
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const queueRefresh = (keys: string[][]) => {
      keys.forEach((key) => pendingKeys.set(JSON.stringify(key), key));
      if (refreshTimer) return;
      refreshTimer = setTimeout(() => {
        refreshTimer = null;
        const keysToRefresh = [...pendingKeys.values()];
        pendingKeys.clear();
        keysToRefresh.forEach((key) => qc.invalidateQueries({ queryKey: key }));
      }, 750);
    };

    const client = new Client({
      webSocketFactory: () => new WebSocket(WS_URL) as any,
      beforeConnect: async () => {
        const currentToken = useAuthStore.getState().user?.token ?? token;
        client.connectHeaders = { Authorization: `Bearer ${currentToken}` };
      },
      reconnectDelay: 5000,
      heartbeatIncoming: 10000,
      heartbeatOutgoing: 10000,
      onConnect: () => {
        client.subscribe(`/topic/data-update/${tenantId}`, (frame) => {
          try {
            const { type } = JSON.parse(frame.body);
            const keys = INVALIDATIONS[type] ?? [];
            queueRefresh(keys);
          } catch {
            // ignore malformed frames
          }
        });
      },
    });

    client.activate();
    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      pendingKeys.clear();
      client.deactivate();
    };
  }, [enabled, token, tenantId, qc]);
}
