import { useEffect } from 'react';
import { Client } from '@stomp/stompjs';
import { useQueryClient } from '@tanstack/react-query';

const PROD_HOST = '3.21.196.51';

const WS_URL = __DEV__
  ? 'ws://localhost:8080/ws-native'
  : `ws://${PROD_HOST}/ws-native`;

// Maps WS event type → React Query keys to invalidate
const INVALIDATIONS: Record<string, string[][]> = {
  CASH_REQUESTS_UPDATED: [
    ['m-cash-requests'],
    ['staff-tasks'],
    ['worker-pending-batches'],
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
  ],
  IN_APP_UPDATED: [
    ['m-unread'],
  ],
};

export function useRealtimeUpdates(enabled = true) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!enabled) return;

    const client = new Client({
      webSocketFactory: () => new WebSocket(WS_URL) as any,
      reconnectDelay: 5000,
      heartbeatIncoming: 10000,
      heartbeatOutgoing: 10000,
      onConnect: () => {
        client.subscribe('/topic/data-update', (frame) => {
          try {
            const { type } = JSON.parse(frame.body);
            const keys = INVALIDATIONS[type] ?? [];
            keys.forEach((key) => qc.invalidateQueries({ queryKey: key }));
          } catch {
            // ignore malformed frames
          }
        });
      },
    });

    client.activate();
    return () => { client.deactivate(); };
  }, [enabled, qc]);
}
