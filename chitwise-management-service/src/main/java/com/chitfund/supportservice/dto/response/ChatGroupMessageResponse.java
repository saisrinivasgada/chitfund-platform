package com.chitfund.supportservice.dto.response;

import lombok.Builder;
import lombok.Data;

import java.time.Instant;

@Data
@Builder
public class ChatGroupMessageResponse {
    private String id;
    private String groupId;
    private String senderId;
    private String senderName;
    private String senderRole;
    private String content;
    private String clientMessageId;
    private boolean deleted;
    private Instant createdAt;
}
