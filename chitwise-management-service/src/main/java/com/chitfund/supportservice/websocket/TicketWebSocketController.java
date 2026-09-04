package com.chitfund.supportservice.websocket;

import com.chitfund.supportservice.domain.entity.SupportTicket;
import com.chitfund.supportservice.dto.response.TicketMessageResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;

import java.util.Map;

@Component
@RequiredArgsConstructor
@Slf4j
public class TicketWebSocketController {

    private final SimpMessagingTemplate messaging;

    public void sendTicketMessage(String ticketId, TicketMessageResponse message) {
        messaging.convertAndSend("/topic/support-ticket." + ticketId, message);
    }

    public void sendMessageDeleted(String ticketId, String messageId) {
        messaging.convertAndSend("/topic/support-ticket." + ticketId,
                Map.of("type", "MESSAGE_DELETED", "messageId", messageId));
    }

    public void notifyNewTicket(SupportTicket ticket) {
        messaging.convertAndSend("/topic/chitwise-pool",
                Map.of(
                        "type", "NEW_TICKET",
                        "ticketId", ticket.getId(),
                        "ticketNumber", ticket.getTicketNumber(),
                        "subject", ticket.getSubject(),
                        "tenantId", ticket.getTenantId()
                ));
    }

    public void notifyStatusChange(String ticketId, String status) {
        messaging.convertAndSend("/topic/support-ticket." + ticketId,
                Map.of("type", "STATUS_CHANGED", "ticketId", ticketId, "status", status));
    }

    public void notifyTyping(String ticketId, String senderName) {
        messaging.convertAndSend("/topic/support-ticket." + ticketId,
                Map.of("type", "TYPING", "senderName", senderName));
    }
}
