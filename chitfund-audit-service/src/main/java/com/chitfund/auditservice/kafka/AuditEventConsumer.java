package com.chitfund.auditservice.kafka;

import com.chitfund.common.event.*;
import com.chitfund.auditservice.dto.AuditLogRequest;
import com.chitfund.auditservice.service.AuditService;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.awspring.cloud.sqs.annotation.SqsListener;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

/**
 * Consumes platform events from SQS and writes immutable audit records.
 *
 * WHY SQS instead of Kafka?
 * All event producers (payment-service, payout-service, member-service) publish
 * to AWS SQS. Kafka was the original plan but was replaced by SQS to avoid
 * running a Kafka broker on the EC2 instance. SQS is managed, serverless, and
 * free-tier friendly for this workload.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class AuditEventConsumer {

    private final AuditService auditService;
    private final ObjectMapper objectMapper;

    // DRAW_OPENED and DRAW_SKIPPED are now audited via direct HTTP in payment-service.
    // The SQS listeners for MONTH_OPENED / MONTH_SKIPPED are removed to prevent duplicate
    // audit records. SQS events are still published for notification-service consumers.

    @SqsListener(SqsQueues.CASH_COLLECTED)
    public void onCashCollected(String payload) {
        try {
            CashCollectedEvent event = objectMapper.readValue(payload, CashCollectedEvent.class);
            auditService.record(new AuditLogRequest(
                    "payment-service", "PAYMENT_BATCH", event.batchId(),
                    event.chitId(), "CASH_COLLECTED",
                    event.collectedByUserId(), "ROLE_STAFF", null,
                    null,
                    "{\"amount\":" + event.amount() + ",\"memberId\":\"" + event.memberId() + "\"}",
                    null
            ));
        } catch (Exception e) {
            log.error("Failed to audit CASH_COLLECTED: {}", e.getMessage(), e);
        }
    }

    @SqsListener(SqsQueues.PAYMENT_COMPLETED)
    public void onPaymentCompleted(String payload) {
        try {
            PaymentCompletedEvent event = objectMapper.readValue(payload, PaymentCompletedEvent.class);
            auditService.record(new AuditLogRequest(
                    "payment-service", "PAYMENT_BATCH", event.batchId(),
                    event.chitId(), "PAYMENT_COMPLETED",
                    event.completedByUserId(), "ROLE_ADMIN", null,
                    null,
                    "{\"amount\":" + event.amount() + ",\"mode\":\"" + event.paymentMode()
                            + "\",\"memberId\":\"" + event.memberId() + "\"}",
                    null
            ));
        } catch (Exception e) {
            log.error("Failed to audit PAYMENT_COMPLETED: {}", e.getMessage(), e);
        }
    }

    // PAYOUT_CREATED and PAYOUT_DISBURSED are now audited via direct HTTP in payout-service.
    // SQS listeners removed to prevent duplicate entries; SQS events still consumed by notification-service.

    @SqsListener(SqsQueues.ORG_RESERVATION_CREATED)
    public void onOrgReservationCreated(String payload) {
        try {
            OrgReservationCreatedEvent event = objectMapper.readValue(payload, OrgReservationCreatedEvent.class);
            auditService.record(new AuditLogRequest(
                    "chit-service", "ORG_RESERVATION", event.reservationId(),
                    event.chitId(), "ORG_RESERVATION_CREATED",
                    event.createdBy(), "ROLE_ADMIN", null,
                    null,
                    "{\"monthNumber\":" + event.monthNumber()
                            + ",\"payoutAmount\":" + event.payoutAmount() + "}",
                    null
            ));
        } catch (Exception e) {
            log.error("Failed to audit ORG_RESERVATION_CREATED: {}", e.getMessage(), e);
        }
    }

    @SqsListener(SqsQueues.ORG_PAYOUT_REALIZED)
    public void onOrgPayoutRealized(String payload) {
        try {
            OrgPayoutRealizedEvent event = objectMapper.readValue(payload, OrgPayoutRealizedEvent.class);
            auditService.record(new AuditLogRequest(
                    "chit-service", "ORG_RESERVATION", event.reservationId(),
                    event.chitId(), "ORG_PAYOUT_REALIZED",
                    event.realizedBy(), "ROLE_ADMIN", null,
                    "{\"status\":\"RESERVED\"}",
                    "{\"status\":\"PROCESSED\",\"payoutAmount\":" + event.payoutAmount() + "}",
                    null
            ));
        } catch (Exception e) {
            log.error("Failed to audit ORG_PAYOUT_REALIZED: {}", e.getMessage(), e);
        }
    }

    // MEMBER_UPDATED audit now written directly by member-service via /internal/audit HTTP call.
    // The SQS listener is kept only for the notification-service consumer (referral change alerts).
    // This class no longer needs to listen to MEMBER_UPDATED to avoid duplicate audit entries.
}
