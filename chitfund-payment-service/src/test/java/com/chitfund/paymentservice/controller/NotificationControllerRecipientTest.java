package com.chitfund.paymentservice.controller;

import com.chitfund.paymentservice.client.MemberServiceClient;
import com.chitfund.paymentservice.client.NotificationServiceClient;
import com.chitfund.paymentservice.domain.enums.NotificationType;
import com.chitfund.paymentservice.service.NotificationService;
import com.chitfund.paymentservice.service.PaymentService;
import com.chitfund.paymentservice.service.WhatsAppService;
import org.junit.jupiter.api.Test;
import org.springframework.security.core.Authentication;

import java.math.BigDecimal;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class NotificationControllerRecipientTest {

    @Test
    void pushReminderResolvesLinkedUserFromTenantMember() {
        NotificationService notifications = mock(NotificationService.class);
        NotificationServiceClient delivery = mock(NotificationServiceClient.class);
        MemberServiceClient members = mock(MemberServiceClient.class);
        UUID memberId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        when(members.getNotificationContact(memberId)).thenReturn(
                new MemberServiceClient.MemberNotificationContact(
                        memberId, userId, "9876543210", "+91", "Tenant Member"));
        NotificationController controller = new NotificationController(
                notifications, mock(WhatsAppService.class), delivery, members,
                mock(PaymentService.class));

        controller.sendReminder(memberId, Map.of("message", "Please review your balance."));

        verify(notifications).notifyUser(userId, NotificationType.PAYMENT_REMINDER,
                "Payment Reminder", "Please review your balance.", null, null, "/member");
        verify(delivery).createInApp(userId, "Payment Reminder", "Please review your balance.",
                "PAYMENT_REMINDER", "/member");
    }

    @Test
    void whatsappUsesStoredContactAndServerCalculatedBalance() {
        NotificationService notifications = mock(NotificationService.class);
        WhatsAppService whatsApp = mock(WhatsAppService.class);
        MemberServiceClient members = mock(MemberServiceClient.class);
        PaymentService payments = mock(PaymentService.class);
        Authentication actor = mock(Authentication.class);
        UUID actorId = UUID.randomUUID();
        UUID memberId = UUID.randomUUID();
        when(actor.getPrincipal()).thenReturn(actorId);
        when(members.getNotificationContact(memberId)).thenReturn(
                new MemberServiceClient.MemberNotificationContact(
                        memberId, null, "9876543210", "+91", "Tenant Member"));
        when(payments.getMemberTotalBalance(memberId)).thenReturn(new BigDecimal("1250.00"));
        when(whatsApp.sendPaymentReminder(
                "9876543210", "Tenant Member", "₹1250", "your ChitWise account"))
                .thenReturn(true);
        NotificationController controller = new NotificationController(
                notifications, whatsApp, mock(NotificationServiceClient.class), members, payments);

        var response = controller.sendWhatsApp(memberId, actor);

        assertThat(response.getBody().isSuccess()).isTrue();
        verify(whatsApp).sendPaymentReminder(
                "9876543210", "Tenant Member", "₹1250", "your ChitWise account");
        verify(notifications).notifyUser(eq(actorId), eq(NotificationType.PAYMENT_REMINDER),
                eq("WhatsApp Reminder Sent"),
                eq("A WhatsApp payment reminder was requested for Tenant Member"),
                eq(null), eq(null), eq("/member"));
    }
}
