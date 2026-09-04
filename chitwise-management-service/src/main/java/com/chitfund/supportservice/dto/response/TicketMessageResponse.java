package com.chitfund.supportservice.dto.response;

import com.chitfund.supportservice.domain.enums.SenderType;
import lombok.Builder;
import lombok.Data;

import java.time.Instant;

@Data
@Builder
public class TicketMessageResponse {
    private String id;
    private String ticketId;
    private String senderId;
    private SenderType senderType;
    private String senderName;
    private String content;
    private boolean deleted;
    private boolean readByCreator;
    private boolean readByHandler;
    private Instant createdAt;
}
