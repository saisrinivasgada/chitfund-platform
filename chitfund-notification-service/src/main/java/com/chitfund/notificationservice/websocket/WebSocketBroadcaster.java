package com.chitfund.notificationservice.websocket;

import lombok.RequiredArgsConstructor;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.Map;

@Component
@RequiredArgsConstructor
public class WebSocketBroadcaster {

    private final SimpMessagingTemplate messagingTemplate;

    public void broadcast(String type) {
        broadcast(type, Map.of());
    }

    public void broadcast(String type, Map<String, String> meta) {
        Map<String, Object> msg = new HashMap<>(meta);
        msg.put("type", type);
        msg.put("ts", System.currentTimeMillis());
        messagingTemplate.convertAndSend("/topic/data-update", msg);
    }
}
