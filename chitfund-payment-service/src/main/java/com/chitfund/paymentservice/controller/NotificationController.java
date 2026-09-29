package com.chitfund.paymentservice.controller;

import com.chitfund.common.dto.ApiResponse;
import com.chitfund.common.exception.BusinessException;
import com.chitfund.common.exception.ErrorCode;
import com.chitfund.paymentservice.client.NotificationServiceClient;
import com.chitfund.paymentservice.client.MemberServiceClient;
import com.chitfund.paymentservice.dto.request.CreateNotifRequest;
import com.chitfund.paymentservice.dto.response.NotificationResponse;
import com.chitfund.paymentservice.service.NotificationService;
import com.chitfund.paymentservice.service.PaymentService;
import com.chitfund.paymentservice.service.WhatsAppService;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
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
    private final WhatsAppService whatsAppService;
    private final NotificationServiceClient notificationServiceClient;
    private final MemberServiceClient memberServiceClient;
    private final PaymentService paymentService;

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
        String role = auth.getAuthorities().iterator().next().getAuthority().replace("ROLE_", "");
        notificationService.markRead(id, userId, role);
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

    /**
     * Frontend: admin sends a payment reminder to a specific member.
     *
     * <p>Role-gated because the body carries a caller-supplied message that is
     * delivered as an in-app notification and a push to the target's device —
     * without this, any authenticated user could push arbitrary text to any
     * userId under the app's own branding.
     *
     * <p>Also tenant-scoped: the role gate alone would still let an admin of one
     * org push a notification to a member of another. Fails closed if the tenant
     * cannot be resolved, since falling open would defeat the check.
     */
    @PostMapping("/reminder/{memberId}")
    @PreAuthorize("hasAuthority('ROLE_ADMIN') or hasAuthority('ROLE_MANAGER')")
    public ResponseEntity<ApiResponse<Void>> sendReminder(@PathVariable UUID memberId,
                                                          @RequestBody(required = false) Map<String, String> body) {
        MemberServiceClient.MemberNotificationContact contact =
                memberServiceClient.getNotificationContact(memberId);
        if (contact.userId() == null) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    "This member has not activated ChitWise app access.");
        }
        String msg = (body != null)
                ? body.getOrDefault("message", "You have outstanding payments. Please clear your dues.")
                : "You have outstanding payments. Please clear your dues.";
        if (msg.isBlank() || msg.length() > 500) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    "Reminder message must contain 1 to 500 characters.");
        }
        notificationService.notifyUser(contact.userId(),
                com.chitfund.paymentservice.domain.enums.NotificationType.PAYMENT_REMINDER,
                "Payment Reminder",
                msg,
                null, null, "/member");
        // In-app bell + Expo push notification to the member's device
        notificationServiceClient.createInApp(contact.userId(), "Payment Reminder", msg, "PAYMENT_REMINDER", "/member");
        notificationServiceClient.sendPushWithData(contact.userId(), "Payment Reminder", msg,
                Map.of("screen", "reminders"));
        return ResponseEntity.ok(ApiResponse.success(null, "Reminder sent"));
    }

    /**
     * Admin sends a WhatsApp message to a member.
     * The client supplies only a tenant member profile id. Recipient, display name
     * and outstanding amount are resolved server-side from their owning services;
     * request-body overrides are deliberately ignored.
     */
    @PostMapping("/whatsapp/{memberId}")
    @org.springframework.security.access.prepost.PreAuthorize("hasAuthority('ROLE_ADMIN') or hasAuthority('ROLE_MANAGER')")
    public ResponseEntity<ApiResponse<Map<String, Object>>> sendWhatsApp(
            @PathVariable UUID memberId,
            Authentication authentication) {
        MemberServiceClient.MemberNotificationContact contact =
                memberServiceClient.getNotificationContact(memberId);
        String phone = contact.phone();
        String memberName = contact.fullName().isBlank() ? "Member" : contact.fullName();
        java.math.BigDecimal outstanding = paymentService.getMemberTotalBalance(memberId);
        String amount = outstanding != null && outstanding.signum() > 0
                ? "₹" + outstanding.stripTrailingZeros().toPlainString() : "";

        if (phone == null || phone.isBlank()) {
            return ResponseEntity.badRequest()
                    .body(ApiResponse.error("VALIDATION_FAILED", "Phone number is required"));
        }

        boolean sent = amount.isBlank()
                ? whatsAppService.sendText(phone, "Hi " + memberName + ", this is a reminder from your chit fund admin.")
                : whatsAppService.sendPaymentReminder(phone, memberName, amount, "your ChitWise account");

        // Confirm the attempt to the actor, not the member being contacted.
        notificationService.notifyUser((UUID) authentication.getPrincipal(),
                com.chitfund.paymentservice.domain.enums.NotificationType.PAYMENT_REMINDER,
                "WhatsApp Reminder Sent",
                "A WhatsApp payment reminder was requested for " + memberName
                        + (sent ? "" : " (delivery pending — check WhatsApp config)"),
                null, null, "/member");

        return ResponseEntity.ok(ApiResponse.success(
                Map.of("sent", sent, "phone", phone.replaceAll("(\\d{3})\\d+(\\d{2})", "$1****$2")),
                sent ? "WhatsApp message sent" : "WhatsApp not configured — in-app notification created"
        ));
    }

    /**
     * Internal endpoint — called by chit-service and other services.
     * Not routed through gateway JWT filter; uses X-Internal-Key instead.
     */
    @PostMapping("/internal/bulk")
    public ResponseEntity<Void> createBulk(
            @RequestBody List<CreateNotifRequest> requests,
            @RequestHeader(value = "X-Internal-Key", required = false) String key,
            @RequestHeader(value = "X-Tenant-ID", required = false) String tenantId) {
        if (!internalKey.equals(key)) {
            return ResponseEntity.status(401).build();
        }
        if (tenantId == null || tenantId.isBlank()) {
            return ResponseEntity.status(403).build();
        }
        notificationService.createBulk(requests, tenantId);
        return ResponseEntity.ok().build();
    }
}
