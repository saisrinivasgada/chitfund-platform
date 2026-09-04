package com.chitfund.supportservice.websocket;

import com.chitfund.supportservice.dto.response.HubMessageResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Controller;

import java.util.Map;

@Controller
@RequiredArgsConstructor
@Slf4j
public class HubChatWebSocketController {

    private final SimpMessagingTemplate messaging;

    public void sendDmMessage(String conversationId, HubMessageResponse msg) {
        messaging.convertAndSend("/topic/hub.dm." + conversationId, msg);
    }

    public void sendDmMessageDeleted(String conversationId, String messageId) {
        messaging.convertAndSend("/topic/hub.dm." + conversationId,
                Map.of("type", "DELETE", "messageId", messageId));
    }

    public void sendGroupMessage(String groupId, HubMessageResponse msg) {
        messaging.convertAndSend("/topic/hub.group." + groupId, msg);
    }

    public void sendGroupMessageDeleted(String groupId, String messageId) {
        messaging.convertAndSend("/topic/hub.group." + groupId,
                Map.of("type", "DELETE", "messageId", messageId));
    }
}
