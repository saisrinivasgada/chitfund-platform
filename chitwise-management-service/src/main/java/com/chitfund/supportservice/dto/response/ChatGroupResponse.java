package com.chitfund.supportservice.dto.response;

import lombok.Builder;
import lombok.Data;

import java.time.Instant;

@Data
@Builder
public class ChatGroupResponse {
    private String id;
    private String tenantId;
    private String name;
    private String description;
    private String createdBy;
    private String createdByName;
    private int memberCount;
    private Instant lastMessageAt;
    private String lastMessagePreview;
    private boolean isMember;
    private Instant createdAt;
}
