package com.chitfund.paymentservice.controller;

import com.chitfund.common.context.TenantContext;
import com.chitfund.common.dto.ApiResponse;
import com.chitfund.common.exception.BusinessException;
import com.chitfund.common.exception.ErrorCode;
import com.chitfund.paymentservice.client.NotificationServiceClient;
import com.chitfund.paymentservice.client.UserServiceClient;
import com.chitfund.paymentservice.dto.request.CreateNotifRequest;
import com.chitfund.paymentservice.dto.response.NotificationResponse;
import com.chitfund.paymentservice.service.NotificationService;
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
    private final UserServiceClient userServiceClient;

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
    @PostMapping("/reminder/{userId}")
    @PreAuthorize("hasRole('ROLE_ADMIN') or hasRole('ROLE_MANAGER')")
    public ResponseEntity<ApiResponse<Void>> sendReminder(@PathVariable UUID userId,
                                                          @RequestBody(required = false) Map<String, String> body) {
        String callerTenant = TenantContext.get();
        String targetTenant = userServiceClient.getUserTenantId(userId);
        if (callerTenant == null || callerTenant.isBlank()
                || targetTenant == null || targetTenant.isBlank()
                || !callerTenant.equals(targetTenant)) {
            throw new BusinessException(ErrorCode.FORBIDDEN,
                    "That user is not in your organisation.");
        }
        String msg = (body != null)
                ? body.getOrDefault("message", "You have outstanding payments. Please clear your dues.")
                : "You have outstanding payments. Please clear your dues.";
        notificationService.notifyUser(userId,
                com.chitfund.paymentservice.domain.enums.NotificationType.PAYMENT_REMINDER,
                "Payment Reminder",
                msg,
                null, null, "/member");
        // In-app bell + Expo push notification to the member's device
        notificationServiceClient.createInApp(userId, "Payment Reminder", msg, "PAYMENT_REMINDER", "/member");
        notificationServiceClient.sendPushWithData(userId, "Payment Reminder", msg, Map.of("screen", "reminders"));
        return ResponseEntity.ok(ApiResponse.success(null, "Reminder sent"));
    }

    /**
     * Admin sends a WhatsApp message to a member.
     * Body: { phone, memberName, outstandingAmount, chitName }
     * The member's phone is passed by the frontend (which already has member data loaded).
     * This avoids a cross-service DB call just to fetch a phone number.
     *
     * INTERVIEW: "Why pass phone from frontend instead of looking it up in backend?"
     * payment-service doesn't own member data. Calling user-service synchronously adds
     * latency and a failure point for what is a best-effort notification. The admin
     * is already on the member's detail page — the phone is already on screen.
     *
     * <p>Before enabling WhatsApp in production (whatsapp.enabled is false today,
     * so this is currently inert): the recipient comes from the request body, so
     * the path userId does not constrain who is messaged and tenant-scoping it —
     * as sendReminder does — would not help. An admin could message any number,
     * at per-message cost. Verifying the phone against the member record would
     * close that, at the price of the cross-service call this comment avoids.
     */
    @PostMapping("/whatsapp/{userId}")
    @org.springframework.security.access.prepost.PreAuthorize("hasRole('ROLE_ADMIN') or hasRole('ROLE_MANAGER')")
    public ResponseEntity<ApiResponse<Map<String, Object>>> sendWhatsApp(
            @PathVariable UUID userId,
            @RequestBody Map<String, String> body) {
        String phone = body.get("phone");
        String memberName = body.getOrDefault("memberName", "Member");
        String amount = body.getOrDefault("outstandingAmount", "");
        String chitName = body.getOrDefault("chitName", "");

        if (phone == null || phone.isBlank()) {
            return ResponseEntity.badRequest()
                    .body(ApiResponse.error("VALIDATION_FAILED", "Phone number is required"));
        }

        boolean sent = amount.isBlank()
                ? whatsAppService.sendText(phone, "Hi " + memberName + ", this is a reminder from your chit fund admin.")
                : whatsAppService.sendPaymentReminder(phone, memberName, amount, chitName.isBlank() ? "your chit" : chitName);

        // Also create an in-app notification so the admin knows it was triggered
        notificationService.notifyUser(userId,
                com.chitfund.paymentservice.domain.enums.NotificationType.PAYMENT_REMINDER,
                "WhatsApp Reminder Sent",
                "A WhatsApp payment reminder was sent to " + memberName + (sent ? "" : " (delivery pending — check WhatsApp config)"),
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
            @RequestHeader(value = "X-Internal-Key", required = false) String key) {
        if (!internalKey.equals(key)) {
            return ResponseEntity.status(401).build();
        }
        notificationService.createBulk(requests);
        return ResponseEntity.ok().build();
    }
}
