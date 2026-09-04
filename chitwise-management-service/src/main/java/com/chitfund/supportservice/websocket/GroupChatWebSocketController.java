package com.chitfund.supportservice.websocket;

import com.chitfund.supportservice.dto.response.ChatGroupMessageResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;

import java.util.Map;

@Component
@RequiredArgsConstructor
public class GroupChatWebSocketController {

    private final SimpMessagingTemplate messaging;

    public void sendGroupMessage(String groupId, ChatGroupMessageResponse message) {
        messaging.convertAndSend("/topic/group." + groupId, message);
    }

    public void sendGroupMessageDeleted(String groupId, String messageId) {
        messaging.convertAndSend("/topic/group." + groupId,
                Map.of("type", "MESSAGE_DELETED", "messageId", messageId));
    }
}
