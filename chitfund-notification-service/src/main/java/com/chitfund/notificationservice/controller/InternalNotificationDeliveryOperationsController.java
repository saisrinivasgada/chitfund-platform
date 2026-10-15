package com.chitfund.notificationservice.controller;

import com.chitfund.common.dto.ApiResponse;
import com.chitfund.notificationservice.outbox.NotificationDeliveryOutbox;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.UUID;

@RestController
@RequestMapping("/internal/operations/notification-deliveries")
public class InternalNotificationDeliveryOperationsController {

    private final NotificationDeliveryOutbox outbox;
    private final byte[] expectedInternalKey;

    public InternalNotificationDeliveryOperationsController(
            NotificationDeliveryOutbox outbox,
            @Value("${notification.internal-key}") String internalKey) {
        this.outbox = outbox;
        this.expectedInternalKey = internalKey.getBytes(StandardCharsets.UTF_8);
    }

    @PostMapping("/{deliveryId}/replay")
    public ResponseEntity<ApiResponse<String>> replay(
            @RequestHeader(value = "X-Internal-Key", required = false) String internalKey,
            @RequestHeader(value = "X-Operator-Id", required = false) String actorId,
            @PathVariable String deliveryId,
            @RequestBody ReplayRequest request) {
        if (!validKey(internalKey)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(ApiResponse.error("AUTH_001", "Unauthorized"));
        }
        if (actorId == null || actorId.isBlank() || actorId.length() > 128) {
            return ResponseEntity.badRequest()
                    .body(ApiResponse.error("GENERAL_400", "Operator identity is required"));
        }
        if (request == null || request.reason() == null || request.reason().isBlank()
                || request.reason().trim().length() > 500) {
            return ResponseEntity.badRequest()
                    .body(ApiResponse.error("GENERAL_400", "Replay reason is required"));
        }

        String canonicalDeliveryId;
        try {
            canonicalDeliveryId = UUID.fromString(deliveryId).toString();
        } catch (IllegalArgumentException exception) {
            return ResponseEntity.badRequest()
                    .body(ApiResponse.error("GENERAL_400", "Invalid delivery ID"));
        }

        boolean replayed = outbox.replayFailed(
                canonicalDeliveryId, actorId.trim(), request.reason().trim());
        if (!replayed) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(ApiResponse.error("GENERAL_404", "Failed notification delivery was not found"));
        }
        return ResponseEntity.ok(ApiResponse.success(
                canonicalDeliveryId, "Notification delivery queued for replay"));
    }

    private boolean validKey(String provided) {
        return provided != null && MessageDigest.isEqual(expectedInternalKey,
                provided.getBytes(StandardCharsets.UTF_8));
    }

    public record ReplayRequest(String reason) { }
}
