package com.chitfund.paymentservice.dto.request;

import com.chitfund.paymentservice.domain.enums.NotificationType;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.UUID;

@Data @Builder @NoArgsConstructor @AllArgsConstructor
public class CreateNotifRequest {
    private UUID recipientUserId;   // null for role-based
    private String recipientRole;   // null for user-specific
    private NotificationType type;
    private String title;
    private String message;
    private String entityType;
    private UUID entityId;
    private String link;
}
