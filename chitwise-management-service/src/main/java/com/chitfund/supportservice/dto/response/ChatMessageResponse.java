package com.chitfund.supportservice.dto.response;

import lombok.Builder;
import lombok.Data;

import java.time.Instant;

@Data @Builder
public class ChatMessageResponse {
    private String id;
    private String conversationId;
    private String senderId;
    private String senderName;
    private String senderRole;
    private String content;
    private String clientMessageId;
    private boolean deleted;
    private Instant createdAt;
}
