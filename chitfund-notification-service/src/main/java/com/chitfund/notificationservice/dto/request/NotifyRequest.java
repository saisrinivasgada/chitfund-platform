package com.chitfund.notificationservice.dto.request;

import com.chitfund.notificationservice.domain.enums.NotificationChannel;
import com.chitfund.notificationservice.domain.enums.NotificationEventType;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.util.Map;
import java.util.UUID;

@Data
public class NotifyRequest {

    @NotNull
    private UUID recipientId;

    // At least one contact must be provided (phone or email)
    private String recipientPhone;
    private String recipientEmail;

    @NotNull
    private NotificationEventType eventType;

    // Preferred channel. If null: SMS if phone present, EMAIL if only email present.
    private NotificationChannel preferredChannel;

    // Template parameters — keys match {placeholders} in NotificationTemplate
    // e.g. { "chitName": "Family Chit", "amount": "5000", "monthNumber": "3" }
    @NotNull
    private Map<String, String> templateParams;
}
