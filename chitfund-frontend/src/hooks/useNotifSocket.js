import { useEffect, useRef } from 'react';
import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import { useAuth } from '../context/AuthContext';

export function useNotifSocket(onInAppUpdated) {
  const { token, tenantId } = useAuth();
  const callbackRef = useRef(onInAppUpdated);
  callbackRef.current = onInAppUpdated;

  useEffect(() => {
    if (!token || !tenantId) return undefined;
    const client = new Client({
      webSocketFactory: () => new SockJS('/ws'),
      connectHeaders: { Authorization: `Bearer ${token}` },
      reconnectDelay: 5000,
      onConnect: () => {
        client.subscribe(`/topic/data-update/${tenantId}`, (msg) => {
          try {
            const data = JSON.parse(msg.body);
            if (data.type === 'IN_APP_UPDATED') {
              callbackRef.current?.();
            }
          } catch { /* ignore WebSocket message parse errors */ }
        });
      },
    });
    client.activate();
    return () => { client.deactivate(); };
  }, [token, tenantId]);
}
