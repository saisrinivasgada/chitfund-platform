package com.chitfund.notificationservice.controller;

import com.chitfund.common.dto.ApiResponse;
import com.chitfund.notificationservice.dto.response.NotificationResponse;
import com.chitfund.notificationservice.service.NotificationService;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/notifications")
@RequiredArgsConstructor
public class NotificationHistoryController {

    private final NotificationService notificationService;

    /**
     * View notification history for a recipient.
     * Admin can see any member's history. Members can only see their own.
     *
     * Useful for: "Did member Ravi actually receive the payment reminder on June 1st?"
     * This is the audit trail that proves notifications were sent.
     */
    @GetMapping("/{recipientId}")
    @PreAuthorize("hasRole('ROLE_ADMIN')")
    public ResponseEntity<ApiResponse<Page<NotificationResponse>>> getHistory(
            @PathVariable UUID recipientId,
            @PageableDefault(size = 20) Pageable pageable) {
        return ResponseEntity.ok(ApiResponse.success(
                notificationService.getHistory(recipientId, pageable)));
    }
}
