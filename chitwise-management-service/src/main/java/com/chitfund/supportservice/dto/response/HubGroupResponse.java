package com.chitfund.supportservice.dto.response;

import lombok.Builder;
import lombok.Data;

import java.time.Instant;

@Data
@Builder
public class HubGroupResponse {
    private String id;
    private String name;
    private String description;
    private int memberCount;
    private String createdBy;
    private String createdByName;
    private Instant lastMessageAt;
    private String lastMessagePreview;
    private Instant createdAt;
}
