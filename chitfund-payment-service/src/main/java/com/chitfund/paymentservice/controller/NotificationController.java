package com.chitfund.paymentservice.controller;

import com.chitfund.common.dto.ApiResponse;
import com.chitfund.paymentservice.dto.request.CreateNotifRequest;
import com.chitfund.paymentservice.dto.response.NotificationResponse;
import com.chitfund.paymentservice.service.NotificationService;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/notifications")
@RequiredArgsConstructor
public class NotificationController {

    private final NotificationService notificationService;

    @Value("${app.internal-key:chitfund-internal-service-key}")
    private String internalKey;

    /** Frontend: my notification feed */
    @GetMapping
    public ResponseEntity<ApiResponse<List<NotificationResponse>>> getMyNotifications(Authentication auth) {
        UUID userId = (UUID) auth.getPrincipal();
        String role = auth.getAuthorities().iterator().next().getAuthority().replace("ROLE_", "");
        return ResponseEntity.ok(ApiResponse.success(notificationService.getForUser(userId, role)));
    }

    /** Frontend: badge count */
    @GetMapping("/unread-count")
    public ResponseEntity<ApiResponse<Map<String, Long>>> getUnreadCount(Authentication auth) {
        UUID userId = (UUID) auth.getPrincipal();
        String role = auth.getAuthorities().iterator().next().getAuthority().replace("ROLE_", "");
        long count = notificationService.countUnread(userId, role);
        return ResponseEntity.ok(ApiResponse.success(Map.of("count", count)));
    }

    /** Frontend: mark one notification read */
    @PatchMapping("/{id}/read")
    public ResponseEntity<ApiResponse<Void>> markRead(@PathVariable UUID id, Authentication auth) {
        UUID userId = (UUID) auth.getPrincipal();
        notificationService.markRead(id, userId);
        return ResponseEntity.ok(ApiResponse.success(null));
    }

    /** Frontend: mark all as read */
    @PatchMapping("/read-all")
    public ResponseEntity<ApiResponse<Void>> markAllRead(Authentication auth) {
        UUID userId = (UUID) auth.getPrincipal();
        String role = auth.getAuthorities().iterator().next().getAuthority().replace("ROLE_", "");
        notificationService.markAllRead(userId, role);
        return ResponseEntity.ok(ApiResponse.success(null));
    }

    /** Frontend: admin sends a payment reminder to a specific member */
    @PostMapping("/reminder/{userId}")
    public ResponseEntity<ApiResponse<Void>> sendReminder(@PathVariable UUID userId,
                                                          @RequestBody(required = false) Map<String, String> body) {
        String msg = (body != null)
                ? body.getOrDefault("message", "You have outstanding payments. Please clear your dues.")
                : "You have outstanding payments. Please clear your dues.";
        notificationService.notifyUser(userId,
                com.chitfund.paymentservice.domain.enums.NotificationType.PAYMENT_REMINDER,
                "Payment Reminder",
                msg,
                null, null, "/member");
        return ResponseEntity.ok(ApiResponse.success(null, "Reminder sent"));
    }

    /**
     * Internal endpoint — called by chit-service and other services.
     * Not routed through gateway JWT filter; uses X-Internal-Key instead.
     */
    @PostMapping("/internal/bulk")
    public ResponseEntity<Void> createBulk(
            @RequestBody List<CreateNotifRequest> requests,
            @RequestHeader(value = "X-Internal-Key", required = false) String key) {
        if (!internalKey.equals(key)) {
            return ResponseEntity.status(401).build();
        }
        notificationService.createBulk(requests);
        return ResponseEntity.ok().build();
    }
}
