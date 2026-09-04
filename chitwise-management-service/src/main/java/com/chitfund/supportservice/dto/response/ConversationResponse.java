package com.chitfund.supportservice.dto.response;

import lombok.Builder;
import lombok.Data;

import java.time.Instant;

@Data @Builder
public class ConversationResponse {
    private String id;
    private String tenantId;
    private String memberId;
    private String memberName;
    private Instant lastMessageAt;
    private String lastMessagePreview;
    private boolean lastMessageIsAdmin;
    private int adminUnread;
    private int memberUnread;
    private int myUnread;
    private Instant createdAt;
}
