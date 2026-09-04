package com.chitfund.supportservice.websocket;

import com.chitfund.supportservice.dto.response.ChatMessageResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;

import java.util.Map;

@Component
@RequiredArgsConstructor
public class ConversationWebSocketController {

    private final SimpMessagingTemplate messaging;

    public void sendChatMessage(String conversationId, ChatMessageResponse message) {
        messaging.convertAndSend("/topic/conversation." + conversationId, message);
    }

    public void sendMessageDeleted(String conversationId, String messageId) {
        messaging.convertAndSend("/topic/conversation." + conversationId,
                Map.of("type", "MESSAGE_DELETED", "messageId", messageId));
    }

    public void sendUnreadUpdate(String conversationId, int adminUnread, int memberUnread) {
        messaging.convertAndSend("/topic/conversation." + conversationId,
                Map.of("type", "UNREAD_UPDATE", "adminUnread", adminUnread, "memberUnread", memberUnread));
    }
}
