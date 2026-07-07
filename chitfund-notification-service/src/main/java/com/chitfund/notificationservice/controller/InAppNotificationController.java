package com.chitfund.notificationservice.controller;

import com.chitfund.common.dto.ApiResponse;
import com.chitfund.notificationservice.dto.response.InAppNotificationResponse;
import com.chitfund.notificationservice.service.InAppNotificationService;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.UUID;

/**
 * In-app notification endpoints — every authenticated user reads only their own notifications.
 *
 * WHY "mine" instead of "/{recipientId}"?
 * Using /mine derives the recipient from the JWT principal — a user can NEVER accidentally
 * (or maliciously) read another user's notifications by guessing a UUID in the URL.
 * This is the Principle of Least Privilege: no route param needed, no access-check boilerplate.
 */
@RestController
@RequestMapping("/notifications")
@RequiredArgsConstructor
public class InAppNotificationController {

    private final InAppNotificationService service;

    private UUID currentUserId() {
        return (UUID) SecurityContextHolder.getContext().getAuthentication().getPrincipal();
    }

    /** GET /notifications/mine?page=0&size=30 */
    @GetMapping("/mine")
    public ResponseEntity<ApiResponse<Page<InAppNotificationResponse>>> getMine(
            @RequestParam(defaultValue = "0")  int page,
            @RequestParam(defaultValue = "30") int size) {
        return ResponseEntity.ok(ApiResponse.success(
                service.getForUser(currentUserId(), page, size)));
    }

    /** GET /notifications/unread-count */
    @GetMapping("/unread-count")
    public ResponseEntity<ApiResponse<Map<String, Long>>> getUnreadCount() {
        long count = service.getUnreadCount(currentUserId());
        return ResponseEntity.ok(ApiResponse.success(Map.of("count", count)));
    }

    /** PATCH /notifications/{id}/read */
    @PatchMapping("/{id}/read")
    public ResponseEntity<ApiResponse<Void>> markRead(@PathVariable UUID id) {
        service.markRead(id, currentUserId());
        return ResponseEntity.ok(ApiResponse.success(null));
    }

    /** PATCH /notifications/read-all */
    @PatchMapping("/read-all")
    public ResponseEntity<ApiResponse<Map<String, Integer>>> markAllRead() {
        int updated = service.markAllRead(currentUserId());
        return ResponseEntity.ok(ApiResponse.success(Map.of("updated", updated)));
    }
}
