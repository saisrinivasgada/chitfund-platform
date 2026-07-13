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

    @SqsListener(SqsQueues.MONTH_OPENED)
    public void onMonthOpened(String payload) {
        try {
            ChitMonthOpenedEvent event = objectMapper.readValue(payload, ChitMonthOpenedEvent.class);
            auditService.record(new AuditLogRequest(
                    "payment-service", "CHIT_MONTH_CYCLE", event.chitId() + "-" + event.monthNumber(),
                    event.chitId(), "MONTH_OPENED",
                    event.openedBy(), "ROLE_ADMIN", null,
                    null,
                    "{\"monthNumber\":" + event.monthNumber() + ",\"dueDate\":\"" + event.dueDate() + "\",\"members\":" + event.totalMembers() + "}",
                    null
            ));
        } catch (Exception e) {
            log.error("Failed to audit MONTH_OPENED: {}", e.getMessage(), e);
        }
    }

    @SqsListener(SqsQueues.MONTH_SKIPPED)
    public void onMonthSkipped(String payload) {
        try {
            ChitMonthSkippedEvent event = objectMapper.readValue(payload, ChitMonthSkippedEvent.class);
            auditService.record(new AuditLogRequest(
                    "payment-service", "CHIT_MONTH_CYCLE", event.chitId() + "-" + event.monthNumber(),
                    event.chitId(), "MONTH_SKIPPED",
                    event.skippedBy(), "ROLE_ADMIN", null,
                    null,
                    "{\"monthNumber\":" + event.monthNumber() + ",\"reason\":\"" + event.skipReason() + "\"}",
                    null
            ));
        } catch (Exception e) {
            log.error("Failed to audit MONTH_SKIPPED: {}", e.getMessage(), e);
        }
    }

    @SqsListener(SqsQueues.CASH_COLLECTED)
    public void onCashCollected(String payload) {
        try {
            CashCollectedEvent event = objectMapper.readValue(payload, CashCollectedEvent.class);
            auditService.record(new AuditLogRequest(
                    "payment-service", "PAYMENT_BATCH", event.batchId(),
                    event.chitId(), "CASH_COLLECTED",
                    event.collectedByUserId(), "ROLE_WORKER", null,
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

    @SqsListener(SqsQueues.PAYOUT_CREATED)
    public void onPayoutCreated(String payload) {
        try {
            PayoutCreatedEvent event = objectMapper.readValue(payload, PayoutCreatedEvent.class);
            auditService.record(new AuditLogRequest(
                    "payout-service", "PAYOUT", event.payoutId(),
                    event.chitId(), "PAYOUT_CREATED",
                    event.createdBy(), "ROLE_ADMIN", null,
                    null,
                    "{\"memberId\":\"" + event.memberId() + "\",\"monthNumber\":" + event.monthNumber()
                            + ",\"netAmount\":" + event.netPayoutAmount() + "}",
                    null
            ));
        } catch (Exception e) {
            log.error("Failed to audit PAYOUT_CREATED: {}", e.getMessage(), e);
        }
    }

    @SqsListener(SqsQueues.PAYOUT_DISBURSED)
    public void onPayoutDisbursed(String payload) {
        try {
            PayoutDisbursedEvent event = objectMapper.readValue(payload, PayoutDisbursedEvent.class);
            auditService.record(new AuditLogRequest(
                    "payout-service", "PAYOUT", event.payoutId(),
                    event.chitId(), "PAYOUT_DISBURSED",
                    event.disbursedBy(), "ROLE_ADMIN", null,
                    "{\"status\":\"PENDING\"}",
                    "{\"status\":\"DISBURSED\",\"mode\":\"" + event.disbursementMode()
                            + "\",\"ref\":\"" + event.referenceNumber() + "\"}",
                    null
            ));
        } catch (Exception e) {
            log.error("Failed to audit PAYOUT_DISBURSED: {}", e.getMessage(), e);
        }
    }

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

    @SqsListener(SqsQueues.MEMBER_UPDATED)
    public void onMemberUpdated(String payload) {
        try {
            MemberUpdatedEvent event = objectMapper.readValue(payload, MemberUpdatedEvent.class);
            String before = event.previousReferredById() != null
                    ? "{\"referredById\":\"" + event.previousReferredById() + "\",\"referredByName\":\""
                            + (event.previousReferredByName() != null ? event.previousReferredByName() : "") + "\"}"
                    : null;
            String after = event.newReferredById() != null
                    ? "{\"referredById\":\"" + event.newReferredById() + "\",\"referredByName\":\""
                            + (event.newReferredByName() != null ? event.newReferredByName() : "") + "\"}"
                    : "{\"referredById\":null}";
            auditService.record(new AuditLogRequest(
                    "member-service", "MEMBER", event.memberId(),
                    null, "PROFILE_UPDATED",
                    event.updatedBy(), "ROLE_ADMIN", null,
                    before,
                    after,
                    "{\"fieldChanged\":\"" + event.fieldChanged() + "\"}"
            ));
        } catch (Exception e) {
            log.error("Failed to audit MEMBER_UPDATED: {}", e.getMessage(), e);
        }
    }
}
