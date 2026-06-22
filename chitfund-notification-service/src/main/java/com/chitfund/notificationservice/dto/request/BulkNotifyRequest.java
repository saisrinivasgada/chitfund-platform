package com.chitfund.notificationservice.dto.request;

import com.chitfund.notificationservice.domain.enums.NotificationChannel;
import com.chitfund.notificationservice.domain.enums.NotificationEventType;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Used for broadcast events like MONTH_SKIPPED — same message, many recipients.
 * Calling service provides the full recipient list (phone numbers are not stored here).
 */
@Data
public class BulkNotifyRequest {

    @NotNull
    @Size(min = 1)
    private List<Recipient> recipients;

    @NotNull
    private NotificationEventType eventType;

    // Same channel for all recipients in this batch
    private NotificationChannel preferredChannel;

    // Same template params for everyone — e.g. { "chitName": "...", "reason": "..." }
    @NotNull
    private Map<String, String> templateParams;

    @Data
    public static class Recipient {
        @NotNull
        private UUID recipientId;
        private String recipientPhone;
        private String recipientEmail;
    }
}
