package com.chitfund.paymentservice.dto.response;

import com.chitfund.paymentservice.domain.enums.NotificationType;
import lombok.Builder;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.UUID;

@Data @Builder
public class NotificationResponse {
    private UUID id;
    private NotificationType type;
    private String title;
    private String message;
    private String entityType;
    private UUID entityId;
    private String link;
    private boolean read;
    private LocalDateTime createdAt;
}
