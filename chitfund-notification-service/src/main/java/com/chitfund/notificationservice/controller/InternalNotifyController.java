package com.chitfund.notificationservice.controller;

import com.chitfund.common.dto.ApiResponse;
import com.chitfund.notificationservice.client.MemberServiceClient;
import com.chitfund.notificationservice.dto.request.BulkNotifyRequest;
import com.chitfund.notificationservice.dto.request.NotifyRequest;
import com.chitfund.notificationservice.dto.response.NotificationResponse;
import com.chitfund.notificationservice.service.InAppNotificationService;
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
import java.util.Map;
import java.util.UUID;

/**
 * Internal endpoints — called by other microservices, not by the frontend.
 */
@RestController
@RequestMapping("/internal/notify")
@RequiredArgsConstructor
@Slf4j
public class InternalNotifyController {

    private final NotificationService notificationService;
    private final InAppNotificationService inAppService;
    private final WebSocketBroadcaster broadcaster;
    private final MemberServiceClient memberServiceClient;

    @Value("${notification.internal-key}")
    private String internalKey;

    private static final Map<String, String> NOTIF_TYPE_TO_WS_EVENT = Map.of(
        "CASH_REQUEST_SUBMITTED", "CASH_REQUESTS_UPDATED",
        "CASH_REQUEST_ASSIGNED",  "CASH_REQUESTS_UPDATED",
        "CASH_REQUEST_UPDATED",   "CASH_REQUESTS_UPDATED",
        "CASH_REQUEST_PICKED_UP", "CASH_REQUESTS_UPDATED",
        "CASH_COLLECTED",         "CASH_REQUESTS_UPDATED",
        "PAYMENT_RECEIVED",       "PAYMENTS_UPDATED",
        "WINNER_SELECTED",        "PAYOUTS_UPDATED",
        "PAYOUT_DISBURSED",       "PAYOUTS_UPDATED"
    );
    // Renewal requests are not in Map.of (10-entry limit) — checked separately
    private static final java.util.Set<String> RENEWAL_TYPES = java.util.Set.of("RENEWAL_REQUEST");

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
     * In-app notification for a specific user (recipientId = user account UUID).
     * Now also accepts an optional "link" field for deep-linking from the bell.
     */
    @PostMapping("/in-app")
    public ResponseEntity<ApiResponse<Void>> inAppNotify(
            @RequestHeader("X-Internal-Key") String key,
            @RequestBody Map<String, Object> body) {

        if (!internalKey.equals(key)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(ApiResponse.error("GENERAL_004", "Invalid internal service key"));
        }

        try {
            UUID recipientId = UUID.fromString((String) body.get("recipientId"));
            String title   = (String) body.getOrDefault("title", "");
            String message = (String) body.getOrDefault("message", "");
            String type    = (String) body.getOrDefault("type", "GENERAL");
            String link    = (String) body.getOrDefault("link", null);
            @SuppressWarnings("unchecked")
            Map<String, String> meta = (Map<String, String>) body.getOrDefault("metadata", Map.of());

            inAppService.create(recipientId, title, message, type, meta, link);
            String wsEvent = NOTIF_TYPE_TO_WS_EVENT.get(type);
            if (wsEvent != null) broadcaster.broadcast(wsEvent);
            if (RENEWAL_TYPES.contains(type)) broadcaster.broadcast("RENEWAL_REQUESTS_UPDATED");
            broadcaster.broadcast("IN_APP_UPDATED");
            return ResponseEntity.ok(ApiResponse.success(null));
        } catch (Exception e) {
            log.error("Failed to create in-app notification: {}", e.getMessage());
            return ResponseEntity.badRequest().body(ApiResponse.error("GENERAL_400", "Bad request"));
        }
    }

    /**
     * Bulk in-app notifications by member profile IDs.
     * Resolves memberIds → userIds internally so callers (chit-service) don't need
     * to know user account UUIDs — they just pass member profile IDs.
     *
     * Body: { memberIds: ["uuid",...], title, message, type, metadata, link }
     */
    @PostMapping("/in-app/bulk-by-member-ids")
    public ResponseEntity<ApiResponse<Void>> inAppBulkByMemberIds(
            @RequestHeader("X-Internal-Key") String key,
            @RequestBody Map<String, Object> body) {

        if (!internalKey.equals(key)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(ApiResponse.error("GENERAL_004", "Invalid internal service key"));
        }

        try {
            @SuppressWarnings("unchecked")
            List<String> memberIds = (List<String>) body.get("memberIds");
            String title   = (String) body.getOrDefault("title", "");
            String message = (String) body.getOrDefault("message", "");
            String type    = (String) body.getOrDefault("type", "GENERAL");
            String link    = (String) body.getOrDefault("link", null);
            @SuppressWarnings("unchecked")
            Map<String, String> meta = (Map<String, String>) body.getOrDefault("metadata", Map.of());

            if (memberIds == null || memberIds.isEmpty()) {
                return ResponseEntity.ok(ApiResponse.success(null));
            }

            Map<String, String> userIdMap = memberServiceClient.batchGetUserIds(memberIds);
            int count = 0;
            for (String memberId : memberIds) {
                String userId = userIdMap.get(memberId);
                if (userId != null) {
                    inAppService.create(UUID.fromString(userId), title, message, type, meta, link);
                    count++;
                }
            }
            log.info("Bulk in-app by member IDs: {} recipients out of {} member IDs", count, memberIds.size());

            String wsEvent = NOTIF_TYPE_TO_WS_EVENT.get(type);
            if (wsEvent != null) broadcaster.broadcast(wsEvent);
            broadcaster.broadcast("IN_APP_UPDATED");
            return ResponseEntity.ok(ApiResponse.success(null));
        } catch (Exception e) {
            log.error("Failed to create bulk in-app notifications: {}", e.getMessage());
            return ResponseEntity.badRequest().body(ApiResponse.error("GENERAL_400", "Bad request"));
        }
    }

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
