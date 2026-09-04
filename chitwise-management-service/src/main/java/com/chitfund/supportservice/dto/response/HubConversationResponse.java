package com.chitfund.supportservice.dto.response;

import lombok.Builder;
import lombok.Data;

import java.time.Instant;

@Data
@Builder
public class HubConversationResponse {
    private String id;
    private String otherEmployeeId;
    private String otherEmployeeName;
    private Instant lastMessageAt;
    private String lastMessagePreview;
    private int unreadCount;
}
