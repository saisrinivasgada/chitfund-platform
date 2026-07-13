package com.chitfund.notificationservice.dto.response;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.Builder;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.Map;
import java.util.UUID;

@Data
@Builder
public class InAppNotificationResponse {
    private UUID id;
    private String title;
    private String message;
    private String type;
    private Map<String, String> metadata;
    private String link;
    private boolean read;
    private LocalDateTime createdAt;

    private static final ObjectMapper MAPPER = new ObjectMapper();

    public static InAppNotificationResponse from(
            com.chitfund.notificationservice.domain.InAppNotification n) {

        Map<String, String> meta = null;
        if (n.getMetadata() != null) {
            try {
                meta = MAPPER.readValue(n.getMetadata(), new TypeReference<>() {});
            } catch (Exception ignored) {}
        }

        return InAppNotificationResponse.builder()
                .id(n.getId())
                .title(n.getTitle())
                .message(n.getMessage())
                .type(n.getType())
                .metadata(meta)
                .link(n.getLink())
                .read(n.isRead())
                .createdAt(n.getCreatedAt())
                .build();
    }
}
