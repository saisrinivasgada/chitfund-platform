import { useEffect, useRef } from 'react';
import { Client } from '@stomp/stompjs';
import { useQueryClient } from '@tanstack/react-query';

// Maps WS event type → React Query keys to invalidate
const INVALIDATIONS = {
  CASH_REQUESTS_UPDATED: [
    ['cashRequests'],        // admin dashboard: ['cashRequests', 'active'] matched by prefix
    ['myCashRequests'],      // member portal requests/overview tabs
    ['my-cash-requests'],
    ['active-cash-requests'], // admin member detail page pending pickups section
    ['member-requests'],      // mobile member portal requests tab
    ['pending-remittance'],
    ['today-batches'],
    ['cashAudit'],
  ],
  PAYMENTS_UPDATED: [
    ['today-batches'],
    ['payment-batches-all'],
    ['wallet-balance'],
    ['today-payouts'],
    ['adminBalance'],        // admin dashboard: member balance after payment recorded
    ['remittance'],          // remittance pending list
    ['drawPayments'],        // draw card rows (per-member paid amounts)
    ['draws'],               // draw card header (settled count, totalCollected)
    ['memberTotalBalance'],
  ],
  PAYOUTS_UPDATED: [
    ['payouts'],             // admin dashboard: ['payouts', 'pending'] matched by prefix
    ['today-payouts'],
    ['wallet-balance'],
  ],
  DRAWS_UPDATED: [
    ['draws'],
    ['today-draws'],
    ['drawPayments'],
    ['chits'],               // chit status updates when draw months open/skip
  ],
  TREASURY_UPDATED: [
    ['wallet-balance'],
    ['wallet-transactions'],
  ],
  IN_APP_UPDATED: [
    ['notifications-unread'],
    ['notifications'],
  ],
};

const WS_URL = import.meta.env.DEV
  ? 'ws://localhost:8080/ws'
  : `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`;

export function useRealtimeUpdates(enabled = true) {
  const qc = useQueryClient();
  const clientRef = useRef(null);

  useEffect(() => {
    if (!enabled) return;

    const client = new Client({
      brokerURL: WS_URL,
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
      onStompError: (frame) => {
        console.warn('[WS] STOMP error', frame.headers['message']);
      },
    });

    client.activate();
    clientRef.current = client;

    return () => {
      client.deactivate();
      clientRef.current = null;
    };
  }, [enabled, qc]);
}
