import { useEffect, useRef } from 'react';
import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client';

export function useNotifSocket(onInAppUpdated) {
  const callbackRef = useRef(onInAppUpdated);
  callbackRef.current = onInAppUpdated;

  useEffect(() => {
    const client = new Client({
      webSocketFactory: () => new SockJS('/ws'),
      reconnectDelay: 5000,
      onConnect: () => {
        client.subscribe('/topic/data-update', (msg) => {
          try {
            const data = JSON.parse(msg.body);
            if (data.type === 'IN_APP_UPDATED') {
              callbackRef.current?.();
            }
          } catch (_) {}
        });
      },
    });
    client.activate();
    return () => { client.deactivate(); };
  }, []);
}
