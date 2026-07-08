package com.chitfund.notificationservice.controller;

import com.chitfund.common.dto.ApiResponse;
import com.chitfund.notificationservice.dto.request.BulkNotifyRequest;
import com.chitfund.notificationservice.dto.request.NotifyRequest;
import com.chitfund.notificationservice.dto.response.NotificationResponse;
import com.chitfund.notificationservice.service.NotificationService;
import com.chitfund.notificationservice.websocket.WebSocketBroadcaster;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * Internal endpoints — called by other microservices, not by the frontend.
 *
 * WHY /internal prefix?
 * - Clearly signals these are service-to-service endpoints, not user-facing
 * - In production, an API gateway or load balancer blocks /internal/** from the public internet
 * - The X-Internal-Key header provides application-level auth on top of network restrictions
 *
 * WHY not JWT here?
 * - Other services are not users — they don't have user JWT tokens
 * - A shared service API key is the standard pattern for internal service calls
 *   (before graduating to mTLS or a service mesh like Istio)
 */
@RestController
@RequestMapping("/internal/notify")
@RequiredArgsConstructor
@Slf4j
public class InternalNotifyController {

    private final NotificationService notificationService;
    private final com.chitfund.notificationservice.service.InAppNotificationService inAppService;
    private final WebSocketBroadcaster broadcaster;

    @Value("${notification.internal-key}")
    private String internalKey;

    private static final java.util.Map<String, String> NOTIF_TYPE_TO_WS_EVENT = java.util.Map.of(
        "CASH_REQUEST_SUBMITTED", "CASH_REQUESTS_UPDATED",
        "CASH_REQUEST_ASSIGNED",  "CASH_REQUESTS_UPDATED",
        "CASH_REQUEST_UPDATED",   "CASH_REQUESTS_UPDATED",
        "CASH_REQUEST_PICKED_UP", "CASH_REQUESTS_UPDATED",
        "CASH_COLLECTED",         "CASH_REQUESTS_UPDATED",
        "PAYMENT_RECEIVED",       "PAYMENTS_UPDATED",
        "WINNER_SELECTED",        "PAYOUTS_UPDATED",
        "PAYOUT_DISBURSED",       "PAYOUTS_UPDATED"
    );

    /**
     * Single notification — payment reminder, winner announcement, payout receipt.
     * Header: X-Internal-Key: <shared secret>
     */
    @PostMapping
    public ResponseEntity<ApiResponse<NotificationResponse>> notify(
            @RequestHeader("X-Internal-Key") String key,
            @Valid @RequestBody NotifyRequest request) {

        if (!internalKey.equals(key)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(ApiResponse.error("GENERAL_004", "Invalid internal service key"));
        }

        return ResponseEntity.ok(ApiResponse.success(notificationService.send(request)));
    }

    /**
     * In-app notification — push to a specific user's notification feed.
     * Called by member-service, payment-service, etc. when they need to push
     * rich in-app notifications with metadata.
     *
     * Body: { recipientId, title, message, type, metadata:{key:value,...} }
     */
    @PostMapping("/in-app")
    public ResponseEntity<ApiResponse<Void>> inAppNotify(
            @RequestHeader("X-Internal-Key") String key,
            @RequestBody java.util.Map<String, Object> body) {

        if (!internalKey.equals(key)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(ApiResponse.error("GENERAL_004", "Invalid internal service key"));
        }

        try {
            java.util.UUID recipientId = java.util.UUID.fromString((String) body.get("recipientId"));
            String title    = (String) body.getOrDefault("title", "");
            String message  = (String) body.getOrDefault("message", "");
            String type     = (String) body.getOrDefault("type", "GENERAL");
            @SuppressWarnings("unchecked")
            java.util.Map<String, String> meta =
                (java.util.Map<String, String>) body.getOrDefault("metadata", java.util.Map.of());
            inAppService.create(recipientId, title, message, type, meta);
            String wsEvent = NOTIF_TYPE_TO_WS_EVENT.get(type);
            if (wsEvent != null) broadcaster.broadcast(wsEvent);
            broadcaster.broadcast("IN_APP_UPDATED");
            return ResponseEntity.ok(ApiResponse.success(null));
        } catch (Exception e) {
            log.error("Failed to create in-app notification: {}", e.getMessage());
            return ResponseEntity.badRequest().body(ApiResponse.error("GENERAL_400", "Bad request"));
        }
    }

    /**
     * Bulk notification — month skipped (all members + workers get same message).
     * Processes each recipient independently so one failure doesn't block others.
     */
    @PostMapping("/bulk")
    public ResponseEntity<ApiResponse<List<NotificationResponse>>> notifyBulk(
            @RequestHeader("X-Internal-Key") String key,
            @Valid @RequestBody BulkNotifyRequest request) {

        if (!internalKey.equals(key)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(ApiResponse.error("GENERAL_004", "Invalid internal service key"));
        }

        List<NotificationResponse> results = notificationService.sendBulk(request);
        log.info("Bulk notification sent: {} recipients, event={}",
                results.size(), request.getEventType());

        return ResponseEntity.ok(ApiResponse.success(results));
    }
}
