package com.chitfund.notificationservice.kafka;

import com.chitfund.notificationservice.client.ChitServiceClient;
import com.chitfund.notificationservice.client.MemberServiceClient;
import com.chitfund.notificationservice.client.UserServiceClient;
import com.chitfund.notificationservice.service.InAppNotificationService;
import com.chitfund.notificationservice.service.NotificationService;
import com.chitfund.notificationservice.repository.EventInboxRepository;
import com.chitfund.notificationservice.outbox.NotificationDeliveryQueue;
import com.chitfund.notificationservice.websocket.WebSocketBroadcaster;
import com.chitfund.common.event.PaymentCompletedEvent;
import com.chitfund.common.event.PaymentIntimationNotificationEvent;
import com.chitfund.common.event.PayoutCreatedEvent;
import com.chitfund.common.event.SqsEventEnvelope;
import com.chitfund.common.event.SqsQueues;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.test.util.ReflectionTestUtils;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class NotificationEventConsumerTest {

    private NotificationEventConsumer consumer(EventInboxRepository inbox,
                                                 NotificationService notificationService) {
        return new NotificationEventConsumer(
                notificationService,
                mock(InAppNotificationService.class),
                mock(NotificationDeliveryQueue.class),
                new ObjectMapper(),
                mock(WebSocketBroadcaster.class),
                mock(MemberServiceClient.class),
                mock(UserServiceClient.class),
                mock(ChitServiceClient.class),
                inbox);
    }

    @Test
    void malformedMessageFailsSoSqsCanRetryIt() {
        NotificationEventConsumer consumer = consumer(
                mock(EventInboxRepository.class), mock(NotificationService.class));

        assertThatThrownBy(() -> consumer.onEvent("not-json"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("processing failed");
    }

    @Test
    void duplicateEventIsAcknowledgedWithoutSendingAgain() {
        NotificationService notificationService = mock(NotificationService.class);
        EventInboxRepository inbox = mock(EventInboxRepository.class);
        when(inbox.claimIfAbsent(eq("22222222-2222-2222-2222-222222222222"),
                eq("PAYMENT_COMPLETED"), any())).thenReturn(0);

        consumer(inbox, notificationService).onEvent("""
                {"eventId":"22222222-2222-2222-2222-222222222222",
                 "eventType":"PAYMENT_COMPLETED","payload":"{}"}
                """);

        verify(notificationService, never()).send(any(), any());
    }

    @Test
    void nonCanonicalEventIdFailsInsteadOfBeingSilentlyTruncated() {
        EventInboxRepository inbox = mock(EventInboxRepository.class);

        assertThatThrownBy(() -> consumer(inbox, mock(NotificationService.class)).onEvent("""
                {"eventId":"not-a-uuid","eventType":"PAYMENT_COMPLETED","payload":"{}"}
                """))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("processing failed");
        verify(inbox, never()).claimIfAbsent(any(), any(), any());
    }

    @Test
    void legacyEnvelopeWithoutEventIdRemainsCompatible() {
        EventInboxRepository inbox = mock(EventInboxRepository.class);

        consumer(inbox, mock(NotificationService.class)).onEvent(
                "{\"eventType\":\"LEGACY_UNKNOWN\",\"payload\":\"{}\"}");

        verify(inbox, never()).claimIfAbsent(any(), any(), any());
    }

    @Test
    void adminAndManagerFanoutIsTenantScopedAndSendsOnePushPerRecipient() {
        UserServiceClient users = mock(UserServiceClient.class);
        InAppNotificationService inApp = mock(InAppNotificationService.class);
        NotificationDeliveryQueue deliveryQueue = mock(NotificationDeliveryQueue.class);
        String adminId = UUID.randomUUID().toString();
        String managerId = UUID.randomUUID().toString();
        when(users.getUserIdsByRole("tenant-a", "ADMIN")).thenReturn(List.of(adminId));
        when(users.getUserIdsByRole("tenant-a", "MANAGER")).thenReturn(List.of(managerId));
        NotificationEventConsumer consumer = new NotificationEventConsumer(
                mock(NotificationService.class), inApp, deliveryQueue,
                new ObjectMapper(), mock(WebSocketBroadcaster.class),
                mock(MemberServiceClient.class), users, mock(ChitServiceClient.class),
                mock(EventInboxRepository.class));

        ReflectionTestUtils.invokeMethod(consumer, "notifyAdminsAndManagers",
                "tenant-a", "Title", "Message", "CASH_REQUEST_SUBMITTED",
                Map.of("requestId", "request-a"), "/payments");

        verify(users).getUserIdsByRole("tenant-a", "ADMIN");
        verify(users).getUserIdsByRole("tenant-a", "MANAGER");
        verify(inApp).create(eq("tenant-a"), eq(UUID.fromString(adminId)), eq("Title"),
                eq("Message"), eq("CASH_REQUEST_SUBMITTED"), any(), eq("/payments"));
        verify(inApp).create(eq("tenant-a"), eq(UUID.fromString(managerId)), eq("Title"),
                eq("Message"), eq("CASH_REQUEST_SUBMITTED"), any(), eq("/payments"));
        verify(deliveryQueue).enqueuePush(any(), eq("tenant-a"), eq(UUID.fromString(adminId)),
                eq("Title"), eq("Message"), eq(Map.of("screen", "payments")));
        verify(deliveryQueue).enqueuePush(any(), eq("tenant-a"), eq(UUID.fromString(managerId)),
                eq("Title"), eq("Message"), eq(Map.of("screen", "payments")));
    }

    @Test
    void pushEventQueuesProviderDeliveryWithTheStableEnvelopeEventId() {
        EventInboxRepository inbox = mock(EventInboxRepository.class);
        NotificationDeliveryQueue deliveryQueue = mock(NotificationDeliveryQueue.class);
        String eventId = "33333333-3333-3333-3333-333333333333";
        String userId = UUID.randomUUID().toString();
        when(inbox.claimIfAbsent(eq(eventId), eq("PUSH_NOTIFICATION"), any()))
                .thenReturn(1);
        NotificationEventConsumer consumer = new NotificationEventConsumer(
                mock(NotificationService.class), mock(InAppNotificationService.class),
                deliveryQueue, new ObjectMapper(), mock(WebSocketBroadcaster.class),
                mock(MemberServiceClient.class), mock(UserServiceClient.class),
                mock(ChitServiceClient.class), inbox);

        consumer.onEvent("""
                {"eventId":"%s","eventType":"PUSH_NOTIFICATION",
                 "payload":"{\\"tenantId\\":\\"tenant-a\\",\\"userId\\":\\"%s\\",\\"title\\":\\"Due\\",\\"body\\":\\"Pay now\\",\\"data\\":{\\"screen\\":\\"payments\\"}}"}
                """.formatted(eventId, userId));

        verify(deliveryQueue).enqueuePush(eventId, "tenant-a", UUID.fromString(userId),
                "Due", "Pay now", Map.of("screen", "payments"));
    }

    @Test
    void payoutCreatedPushesContainWorkingMemberNavigation() throws Exception {
        EventInboxRepository inbox = mock(EventInboxRepository.class);
        NotificationDeliveryQueue deliveryQueue = mock(NotificationDeliveryQueue.class);
        MemberServiceClient members = mock(MemberServiceClient.class);
        ChitServiceClient chits = mock(ChitServiceClient.class);
        InAppNotificationService inApp = mock(InAppNotificationService.class);
        String eventId = "44444444-4444-4444-4444-444444444444";
        String winnerMember = UUID.randomUUID().toString();
        String otherMember = UUID.randomUUID().toString();
        String winnerUser = UUID.randomUUID().toString();
        String otherUser = UUID.randomUUID().toString();
        when(inbox.claimIfAbsent(eq(eventId), eq(SqsQueues.EVT_PAYOUT_CREATED), any())).thenReturn(1);
        when(members.getUserId("tenant-a", winnerMember)).thenReturn(winnerUser);
        when(chits.getActiveMemberIds("chit-a", "tenant-a"))
                .thenReturn(List.of(winnerMember, otherMember));
        when(members.batchGetUserIds("tenant-a", List.of(winnerMember, otherMember)))
                .thenReturn(Map.of(winnerMember, winnerUser, otherMember, otherUser));
        ObjectMapper mapper = new ObjectMapper().findAndRegisterModules();
        NotificationEventConsumer consumer = new NotificationEventConsumer(
                mock(NotificationService.class), inApp, deliveryQueue, mapper,
                mock(WebSocketBroadcaster.class), members, mock(UserServiceClient.class), chits, inbox);
        PayoutCreatedEvent event = new PayoutCreatedEvent(
                "payout-a", "chit-a", winnerMember, 3,
                new BigDecimal("100000"), new BigDecimal("20000"),
                new BigDecimal("80000"), "admin-a", Instant.now(), "tenant-a");

        consumer.onEvent(mapper.writeValueAsString(new SqsEventEnvelope(
                eventId, SqsQueues.EVT_PAYOUT_CREATED, mapper.writeValueAsString(event))));

        verify(deliveryQueue).enqueuePush(eventId, "tenant-a", UUID.fromString(winnerUser),
                "You Won the Draw!", "Congratulations! Payout of ₹80000 approved for month 3",
                Map.of("screen", "payouts", "chitId", "chit-a"));
        verify(deliveryQueue).enqueuePush(eventId, "tenant-a", UUID.fromString(otherUser),
                "Draw Result — Draw 3", "Draw 3 is complete. Payout approved.",
                Map.of("screen", "chits", "chitId", "chit-a"));
    }

    // ── Payment intimation approval notification tests ────────────────────────

    @Test
    void intimationApprovalCreatesExactlyOneInAppAndOnePushWithIntimationMetadata() throws Exception {
        EventInboxRepository inbox = mock(EventInboxRepository.class);
        InAppNotificationService inApp = mock(InAppNotificationService.class);
        NotificationDeliveryQueue deliveryQueue = mock(NotificationDeliveryQueue.class);
        MemberServiceClient members = mock(MemberServiceClient.class);
        String eventId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
        String memberId = UUID.randomUUID().toString();
        String userId = UUID.randomUUID().toString();
        String chitId = UUID.randomUUID().toString();
        String intimationId = UUID.randomUUID().toString();

        when(inbox.claimIfAbsent(eq(eventId), eq(SqsQueues.EVT_PAYMENT_COMPLETED), any())).thenReturn(1);
        when(members.getUserId("tenant-a", memberId)).thenReturn(userId);

        ObjectMapper mapper = new ObjectMapper().findAndRegisterModules();
        NotificationEventConsumer consumer = new NotificationEventConsumer(
                mock(NotificationService.class), inApp, deliveryQueue, mapper,
                mock(WebSocketBroadcaster.class), members, mock(UserServiceClient.class),
                mock(ChitServiceClient.class), inbox);

        PaymentCompletedEvent event = new PaymentCompletedEvent(
                UUID.randomUUID().toString(), chitId, memberId,
                new BigDecimal("1000.00"), "UPI",
                new BigDecimal("5000.00"), new BigDecimal("3000.00"), new BigDecimal("2000.00"),
                1, 0, 2, 0, LocalDate.now(), UUID.randomUUID().toString(), Instant.now(),
                "INTIM:" + intimationId, "UNKNOWN", Instant.now(), "tenant-a", "ADMIN");

        consumer.onEvent(mapper.writeValueAsString(
                new SqsEventEnvelope(eventId, SqsQueues.EVT_PAYMENT_COMPLETED,
                        mapper.writeValueAsString(event))));

        // Exactly one in-app notification with the intimation-specific body and metadata
        ArgumentCaptor<Map> metaCaptor = ArgumentCaptor.forClass(Map.class);
        ArgumentCaptor<String> bodyCaptor = ArgumentCaptor.forClass(String.class);
        verify(inApp, times(1)).create(
                eq("tenant-a"), eq(UUID.fromString(userId)),
                eq("Payment Received"), bodyCaptor.capture(),
                eq("PAYMENT_RECEIVED"), metaCaptor.capture(),
                eq("/member/chits/" + chitId));
        assertThat(bodyCaptor.getValue()).contains("approved and recorded");
        assertThat(metaCaptor.getValue()).containsKey("intimationId");
        assertThat(metaCaptor.getValue().get("intimationId")).isEqualTo(intimationId);

        // Exactly one push with intimationId in data
        verify(deliveryQueue, times(1)).enqueuePush(
                eq(eventId), eq("tenant-a"), eq(UUID.fromString(userId)),
                eq("Payment Received"), anyString(),
                argThat(data -> intimationId.equals(((Map<?, ?>) data).get("intimationId"))));
    }

    @Test
    void intimationApprovalIsIdempotentViaSqsInboxClaim() throws Exception {
        EventInboxRepository inbox = mock(EventInboxRepository.class);
        InAppNotificationService inApp = mock(InAppNotificationService.class);
        String eventId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
        // inbox already claimed → returns 0
        when(inbox.claimIfAbsent(eq(eventId), eq(SqsQueues.EVT_PAYMENT_COMPLETED), any())).thenReturn(0);

        ObjectMapper mapper = new ObjectMapper().findAndRegisterModules();
        NotificationEventConsumer consumer = new NotificationEventConsumer(
                mock(NotificationService.class), inApp, mock(NotificationDeliveryQueue.class),
                mapper, mock(WebSocketBroadcaster.class), mock(MemberServiceClient.class),
                mock(UserServiceClient.class), mock(ChitServiceClient.class), inbox);

        String memberId = UUID.randomUUID().toString();
        String intimationId = UUID.randomUUID().toString();
        PaymentCompletedEvent event = new PaymentCompletedEvent(
                UUID.randomUUID().toString(), UUID.randomUUID().toString(), memberId,
                new BigDecimal("500.00"), "UPI",
                new BigDecimal("1000.00"), new BigDecimal("500.00"), new BigDecimal("500.00"),
                1, 0, 1, 0, LocalDate.now(), UUID.randomUUID().toString(), Instant.now(),
                "INTIM:" + intimationId, "UNKNOWN", Instant.now(), "tenant-a", "ADMIN");

        consumer.onEvent(mapper.writeValueAsString(
                new SqsEventEnvelope(eventId, SqsQueues.EVT_PAYMENT_COMPLETED,
                        mapper.writeValueAsString(event))));

        // Duplicate: no in-app notification created
        verify(inApp, never()).create(any(), any(), any(), any(), any(), any(), any());
    }

    @Test
    void missingUserAccountHandledSafelyWithNoExceptionAndNoInAppOrPush() throws Exception {
        EventInboxRepository inbox = mock(EventInboxRepository.class);
        InAppNotificationService inApp = mock(InAppNotificationService.class);
        NotificationDeliveryQueue deliveryQueue = mock(NotificationDeliveryQueue.class);
        MemberServiceClient members = mock(MemberServiceClient.class);
        String eventId = "cccccccc-cccc-cccc-cccc-cccccccccccc";

        when(inbox.claimIfAbsent(eq(eventId), eq(SqsQueues.EVT_PAYMENT_COMPLETED), any())).thenReturn(1);
        // member-service returns null (member has no user account or service is unreachable)
        when(members.getUserId(any(), any())).thenReturn(null);

        ObjectMapper mapper = new ObjectMapper().findAndRegisterModules();
        NotificationEventConsumer consumer = new NotificationEventConsumer(
                mock(NotificationService.class), inApp, deliveryQueue, mapper,
                mock(WebSocketBroadcaster.class), members, mock(UserServiceClient.class),
                mock(ChitServiceClient.class), inbox);

        PaymentCompletedEvent event = new PaymentCompletedEvent(
                UUID.randomUUID().toString(), UUID.randomUUID().toString(), UUID.randomUUID().toString(),
                new BigDecimal("200.00"), "CASH",
                new BigDecimal("200.00"), new BigDecimal("200.00"), BigDecimal.ZERO,
                1, 0, 0, 0, LocalDate.now(), UUID.randomUUID().toString(), Instant.now(),
                "INTIM:" + UUID.randomUUID(), "UNKNOWN", Instant.now(), "tenant-a", "ADMIN");

        // Must not throw — SQS must not retry endlessly for a missing user account
        consumer.onEvent(mapper.writeValueAsString(
                new SqsEventEnvelope(eventId, SqsQueues.EVT_PAYMENT_COMPLETED,
                        mapper.writeValueAsString(event))));

        verify(inApp, never()).create(any(), any(), any(), any(), any(), any(), any());
        verify(deliveryQueue, never()).enqueuePush(any(), any(), any(), any(), any(), any());
    }

    @Test
    void intimationRejectionSendsExactlyOneRejectionNotification() throws Exception {
        EventInboxRepository inbox = mock(EventInboxRepository.class);
        InAppNotificationService inApp = mock(InAppNotificationService.class);
        NotificationDeliveryQueue deliveryQueue = mock(NotificationDeliveryQueue.class);
        MemberServiceClient members = mock(MemberServiceClient.class);
        String eventId = "dddddddd-dddd-dddd-dddd-dddddddddddd";
        String memberId = UUID.randomUUID().toString();
        String userId = UUID.randomUUID().toString();
        String intimationId = UUID.randomUUID().toString();

        when(inbox.claimIfAbsent(eq(eventId), eq(SqsQueues.EVT_PAYMENT_INTIMATION), any())).thenReturn(1);
        when(members.getUserId("tenant-b", memberId)).thenReturn(userId);

        ObjectMapper mapper = new ObjectMapper().findAndRegisterModules();
        NotificationEventConsumer consumer = new NotificationEventConsumer(
                mock(NotificationService.class), inApp, deliveryQueue, mapper,
                mock(WebSocketBroadcaster.class), members, mock(UserServiceClient.class),
                mock(ChitServiceClient.class), inbox);

        PaymentIntimationNotificationEvent event = new PaymentIntimationNotificationEvent(
                intimationId, memberId, null, new BigDecimal("750.00"),
                "REJECTED", "Payment reference not found", "tenant-b");

        consumer.onEvent(mapper.writeValueAsString(
                new SqsEventEnvelope(eventId, SqsQueues.EVT_PAYMENT_INTIMATION,
                        mapper.writeValueAsString(event))));

        verify(inApp, times(1)).create(
                eq("tenant-b"), eq(UUID.fromString(userId)),
                eq("Payment Intimation Rejected"), contains("rejected"),
                eq("PAYMENT_INTIMATION_REJECTED"), any(), eq("/member"));
        verify(deliveryQueue, times(1)).enqueuePush(
                any(), eq("tenant-b"), eq(UUID.fromString(userId)),
                eq("Payment Intimation Rejected"), anyString(), any());
        // No separate APPROVED notification — APPROVED sub-type has no producer
        verify(inApp, never()).create(any(), any(), contains("Approved"), any(), any(), any(), any());
    }

    @Test
    void anotherTenantsPaymentCompletedEventCarriesItsOwnTenantAndDoesNotCrossContaminate()
            throws Exception {
        EventInboxRepository inbox = mock(EventInboxRepository.class);
        InAppNotificationService inApp = mock(InAppNotificationService.class);
        MemberServiceClient members = mock(MemberServiceClient.class);
        String eventId = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";
        String memberId = UUID.randomUUID().toString();
        String userIdTenantX = UUID.randomUUID().toString();

        when(inbox.claimIfAbsent(eq(eventId), eq(SqsQueues.EVT_PAYMENT_COMPLETED), any())).thenReturn(1);
        when(members.getUserId("tenant-x", memberId)).thenReturn(userIdTenantX);

        ObjectMapper mapper = new ObjectMapper().findAndRegisterModules();
        NotificationEventConsumer consumer = new NotificationEventConsumer(
                mock(NotificationService.class), inApp, mock(NotificationDeliveryQueue.class),
                mapper, mock(WebSocketBroadcaster.class), members, mock(UserServiceClient.class),
                mock(ChitServiceClient.class), inbox);

        PaymentCompletedEvent event = new PaymentCompletedEvent(
                UUID.randomUUID().toString(), UUID.randomUUID().toString(), memberId,
                new BigDecimal("300.00"), "UPI",
                new BigDecimal("600.00"), new BigDecimal("300.00"), new BigDecimal("300.00"),
                1, 0, 1, 0, LocalDate.now(), UUID.randomUUID().toString(), Instant.now(),
                null, "UNKNOWN", Instant.now(), "tenant-x", "ADMIN");

        consumer.onEvent(mapper.writeValueAsString(
                new SqsEventEnvelope(eventId, SqsQueues.EVT_PAYMENT_COMPLETED,
                        mapper.writeValueAsString(event))));

        // In-app notification stored under tenant-x only — not tenant-y or any other tenant
        verify(inApp).create(eq("tenant-x"), eq(UUID.fromString(userIdTenantX)),
                any(), any(), any(), any(), any());
        verify(members).getUserId(eq("tenant-x"), eq(memberId));
        verify(members, never()).getUserId(eq("tenant-y"), any());
    }

    @Test
    void transactionRollbackSignaledByExceptionSoSqsWillRetry() throws Exception {
        EventInboxRepository inbox = mock(EventInboxRepository.class);
        InAppNotificationService inApp = mock(InAppNotificationService.class);
        MemberServiceClient members = mock(MemberServiceClient.class);
        String eventId = "ffffffff-ffff-ffff-ffff-ffffffffffff";
        String memberId = UUID.randomUUID().toString();
        String userId = UUID.randomUUID().toString();

        when(inbox.claimIfAbsent(eq(eventId), eq(SqsQueues.EVT_PAYMENT_COMPLETED), any())).thenReturn(1);
        when(members.getUserId("tenant-a", memberId)).thenReturn(userId);
        // Simulates a transient DB failure writing the in-app notification
        org.mockito.Mockito.doThrow(new IllegalStateException("DB write failed"))
                .when(inApp).create(any(), any(), any(), any(), any(), any(), any());

        ObjectMapper mapper = new ObjectMapper().findAndRegisterModules();
        NotificationEventConsumer consumer = new NotificationEventConsumer(
                mock(NotificationService.class), inApp, mock(NotificationDeliveryQueue.class),
                mapper, mock(WebSocketBroadcaster.class), members, mock(UserServiceClient.class),
                mock(ChitServiceClient.class), inbox);

        PaymentCompletedEvent event = new PaymentCompletedEvent(
                UUID.randomUUID().toString(), UUID.randomUUID().toString(), memberId,
                new BigDecimal("400.00"), "UPI",
                new BigDecimal("400.00"), new BigDecimal("400.00"), BigDecimal.ZERO,
                1, 0, 0, 0, LocalDate.now(), UUID.randomUUID().toString(), Instant.now(),
                null, "UNKNOWN", Instant.now(), "tenant-a", "ADMIN");

        // Exception propagates so the @Transactional rolls back the inbox claim
        // and SQS will redeliver the message for retry
        assertThatThrownBy(() -> consumer.onEvent(mapper.writeValueAsString(
                new SqsEventEnvelope(eventId, SqsQueues.EVT_PAYMENT_COMPLETED,
                        mapper.writeValueAsString(event)))))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("processing failed");
    }
}
