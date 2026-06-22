package com.chitfund.auditservice.kafka;

import com.chitfund.common.event.*;
import com.chitfund.auditservice.dto.AuditLogRequest;
import com.chitfund.auditservice.service.AuditService;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

/**
 * Consumes every platform event and writes an immutable audit record.
 *
 * WHY audit-service listens to ALL topics?
 * It is the system of record for "what happened and who did it."
 * Every state change in the platform should be auditable.
 * Having all events flow through one consumer makes compliance reporting trivial —
 * query audit_logs and you have a complete cross-service timeline.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class AuditEventConsumer {

    private final AuditService auditService;
    private final ObjectMapper objectMapper;

    @KafkaListener(topics = KafkaTopics.MONTH_OPENED, groupId = "audit-service")
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

    @KafkaListener(topics = KafkaTopics.MONTH_SKIPPED, groupId = "audit-service")
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

    @KafkaListener(topics = KafkaTopics.CASH_COLLECTED, groupId = "audit-service")
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

    @KafkaListener(topics = KafkaTopics.PAYMENT_COMPLETED, groupId = "audit-service")
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

    @KafkaListener(topics = KafkaTopics.PAYOUT_CREATED, groupId = "audit-service")
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

    @KafkaListener(topics = KafkaTopics.PAYOUT_DISBURSED, groupId = "audit-service")
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
}
