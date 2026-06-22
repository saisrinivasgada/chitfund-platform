package com.chitfund.notificationservice.controller;

import com.chitfund.common.dto.ApiResponse;
import com.chitfund.notificationservice.dto.request.BulkNotifyRequest;
import com.chitfund.notificationservice.dto.request.NotifyRequest;
import com.chitfund.notificationservice.dto.response.NotificationResponse;
import com.chitfund.notificationservice.service.NotificationService;
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

    @Value("${notification.internal-key}")
    private String internalKey;

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
