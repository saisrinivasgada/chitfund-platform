package com.chitfund.notificationservice.dto.response;

import com.chitfund.notificationservice.domain.enums.NotificationChannel;
import com.chitfund.notificationservice.domain.enums.NotificationEventType;
import com.chitfund.notificationservice.domain.enums.NotificationStatus;
import lombok.Builder;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.UUID;

@Data
@Builder
public class NotificationResponse {
    private UUID id;
    private UUID recipientId;
    private String recipientPhone;
    private String recipientEmail;
    private NotificationChannel channel;
    private NotificationEventType eventType;
    private String message;
    private NotificationStatus status;
    private String errorMessage;
    private String externalId;
    private LocalDateTime sentAt;
    private LocalDateTime createdAt;
}
