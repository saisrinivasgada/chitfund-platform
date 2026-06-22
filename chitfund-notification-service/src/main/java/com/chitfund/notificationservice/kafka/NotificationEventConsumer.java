package com.chitfund.notificationservice.kafka;

import com.chitfund.common.event.*;
import com.chitfund.notificationservice.domain.enums.NotificationEventType;
import com.chitfund.notificationservice.dto.request.NotifyRequest;
import com.chitfund.notificationservice.service.NotificationService;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.UUID;

/**
 * Consumes all payment and payout events and dispatches notifications.
 *
 * WHY String payload + manual ObjectMapper instead of typed @KafkaListener?
 * With Spring's JsonDeserializer and type headers, Spring resolves the type automatically.
 * But when you have 6 topics with 6 different types in one class, you'd need a separate
 * ConsumerFactory per type. String + manual deserialization is more explicit and easier
 * to reason about — you always know exactly what you're doing with the bytes.
 *
 * WHY groupId = "notification-service"?
 * Each service has its own consumer group. Kafka delivers each event to ONE consumer
 * within a group. Since all notification-service instances share the same group,
 * load is balanced across them. reporting-service has its own group so it also gets
 * every event independently — fan-out at the consumer-group level.
 *
 * WHY @KafkaListener per topic method (not one method for all topics)?
 * Each event has a different type and different notification logic. A single dispatcher
 * would be a massive switch statement — harder to read and extend. One method per topic
 * follows the Open/Closed principle: adding a new topic = adding a new method.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class NotificationEventConsumer {

    private final NotificationService notificationService;
    private final ObjectMapper objectMapper;

    @KafkaListener(topics = KafkaTopics.MONTH_OPENED, groupId = "notification-service")
    public void onMonthOpened(String payload) {
        try {
            ChitMonthOpenedEvent event = objectMapper.readValue(payload, ChitMonthOpenedEvent.class);
            log.info("Sending PAYMENT_DUE notifications for chit {} month {} ({} members)",
                    event.chitId(), event.monthNumber(), event.memberIds().size());

            for (String memberId : event.memberIds()) {
                NotifyRequest req = buildRequest(
                        UUID.fromString(memberId),
                        null, null,
                        NotificationEventType.PAYMENT_DUE,
                        Map.of(
                                "amount",      event.installmentAmount().toPlainString(),
                                "chitName",    event.chitId(),   // chitName not in event; use ID as fallback
                                "monthNumber", event.monthNumber().toString(),
                                "dueDate",     event.dueDate().toString()
                        )
                );
                notificationService.send(req);
            }
        } catch (Exception e) {
            log.error("Failed to process MONTH_OPENED event: {}", e.getMessage(), e);
        }
    }

    @KafkaListener(topics = KafkaTopics.MONTH_SKIPPED, groupId = "notification-service")
    public void onMonthSkipped(String payload) {
        try {
            ChitMonthSkippedEvent event = objectMapper.readValue(payload, ChitMonthSkippedEvent.class);
            log.info("Sending MONTH_SKIPPED notifications for chit {} month {} ({} members)",
                    event.chitId(), event.monthNumber(), event.memberIds().size());

            Map<String, String> params = Map.of(
                    "chitName",    event.chitId(),
                    "monthNumber", event.monthNumber().toString(),
                    "reason",      event.skipReason() != null ? event.skipReason() : "Not specified"
            );

            for (String memberId : event.memberIds()) {
                NotifyRequest req = buildRequest(
                        UUID.fromString(memberId), null, null,
                        NotificationEventType.MONTH_SKIPPED, params);
                notificationService.send(req);
            }
        } catch (Exception e) {
            log.error("Failed to process MONTH_SKIPPED event: {}", e.getMessage(), e);
        }
    }

    @KafkaListener(topics = KafkaTopics.CASH_COLLECTED, groupId = "notification-service")
    public void onCashCollected(String payload) {
        try {
            CashCollectedEvent event = objectMapper.readValue(payload, CashCollectedEvent.class);
            log.info("Cash collected alert: ₹{} from member {} by worker {}",
                    event.amount(), event.memberId(), event.collectedByUserId());

            // Alert goes to the worker who collected (they need confirmation), using their userId as recipientId.
            // In production: admin group notification via a dedicated admin broadcast topic.
            NotifyRequest req = buildRequest(
                    UUID.fromString(event.collectedByUserId()),
                    null, null,
                    NotificationEventType.CASH_COLLECTED,
                    Map.of(
                            "workerName", event.collectedByUserId(),
                            "amount",     event.amount().toPlainString(),
                            "memberName", event.memberId(),
                            "chitName",   event.chitId()
                    )
            );
            notificationService.send(req);
        } catch (Exception e) {
            log.error("Failed to process CASH_COLLECTED event: {}", e.getMessage(), e);
        }
    }

    @KafkaListener(topics = KafkaTopics.PAYMENT_COMPLETED, groupId = "notification-service")
    public void onPaymentCompleted(String payload) {
        try {
            PaymentCompletedEvent event = objectMapper.readValue(payload, PaymentCompletedEvent.class);
            String remaining = event.totalOutstanding().compareTo(java.math.BigDecimal.ZERO) > 0
                    ? "Remaining balance: ₹" + event.totalOutstanding().toPlainString()
                    : "Account is fully settled for this chit.";

            NotifyRequest req = buildRequest(
                    UUID.fromString(event.memberId()),
                    null, null,
                    NotificationEventType.PAYMENT_RECEIVED,
                    Map.of(
                            "amount",           event.amount().toPlainString(),
                            "chitName",         event.chitId(),
                            "monthNumber",      String.valueOf(event.monthsSettled()),
                            "remainingBalance", remaining
                    )
            );
            notificationService.send(req);
        } catch (Exception e) {
            log.error("Failed to process PAYMENT_COMPLETED event: {}", e.getMessage(), e);
        }
    }

    @KafkaListener(topics = KafkaTopics.PAYOUT_CREATED, groupId = "notification-service")
    public void onPayoutCreated(String payload) {
        try {
            PayoutCreatedEvent event = objectMapper.readValue(payload, PayoutCreatedEvent.class);
            NotifyRequest req = buildRequest(
                    UUID.fromString(event.memberId()),
                    null, null,
                    NotificationEventType.WINNER_SELECTED,
                    Map.of(
                            "chitName",    event.chitId(),
                            "monthNumber", event.monthNumber().toString(),
                            "amount",      event.netPayoutAmount().toPlainString()
                    )
            );
            notificationService.send(req);
        } catch (Exception e) {
            log.error("Failed to process PAYOUT_CREATED event: {}", e.getMessage(), e);
        }
    }

    @KafkaListener(topics = KafkaTopics.PAYOUT_DISBURSED, groupId = "notification-service")
    public void onPayoutDisbursed(String payload) {
        try {
            PayoutDisbursedEvent event = objectMapper.readValue(payload, PayoutDisbursedEvent.class);
            NotifyRequest req = buildRequest(
                    UUID.fromString(event.memberId()),
                    null, null,
                    NotificationEventType.PAYOUT_DISBURSED,
                    Map.of(
                            "amount",    event.netPayoutAmount().toPlainString(),
                            "chitName",  event.chitId(),
                            "mode",      event.disbursementMode(),
                            "reference", event.referenceNumber() != null ? event.referenceNumber() : "N/A"
                    )
            );
            notificationService.send(req);
        } catch (Exception e) {
            log.error("Failed to process PAYOUT_DISBURSED event: {}", e.getMessage(), e);
        }
    }

    private NotifyRequest buildRequest(UUID recipientId, String phone, String email,
                                       NotificationEventType eventType, Map<String, String> params) {
        NotifyRequest req = new NotifyRequest();
        req.setRecipientId(recipientId);
        req.setRecipientPhone(phone);
        req.setRecipientEmail(email);
        req.setEventType(eventType);
        req.setTemplateParams(params);
        return req;
    }
}
