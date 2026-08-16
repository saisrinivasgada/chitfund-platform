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
 * Consumes platform events from the consolidated audit SQS queue and writes
 * immutable audit records.
 *
 * WHY one queue instead of per-event queues?
 * With 10 queues polled continuously, the app was generating ~2.6M SQS requests
 * per month — over the 1M free-tier limit. One queue per consumer service drops
 * this to ~260K requests/month (2 queues × 3 polls/min × 60 × 24 × 30).
 *
 * WHY only CASH_COLLECTED and PAYMENT_COMPLETED here?
 * All other events (draws, payouts, org reservations, member updates) are audited
 * via direct HTTP calls from the originating service to /internal/audit. Only
 * events that need both notification and audit fan-out go through SQS.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class AuditEventConsumer {

    private final AuditService auditService;
    private final ObjectMapper objectMapper;

    @SqsListener(SqsQueues.AUDIT_EVENTS)
    public void onEvent(String raw) {
        try {
            SqsEventEnvelope envelope = objectMapper.readValue(raw, SqsEventEnvelope.class);
            switch (envelope.eventType()) {
                case SqsQueues.EVT_CASH_COLLECTED ->
                    onCashCollected(objectMapper.readValue(envelope.payload(), CashCollectedEvent.class));
                case SqsQueues.EVT_PAYMENT_COMPLETED ->
                    onPaymentCompleted(objectMapper.readValue(envelope.payload(), PaymentCompletedEvent.class));
                default ->
                    log.warn("Unknown audit event type: {}", envelope.eventType());
            }
        } catch (Exception e) {
            log.error("Failed to process audit event: {}", e.getMessage(), e);
        }
    }

    private void onCashCollected(CashCollectedEvent event) {
        try {
            auditService.record(new AuditLogRequest(
                    "payment-service", "PAYMENT_BATCH", event.batchId(),
                    event.chitId(), "CASH_COLLECTED",
                    event.collectedByUserId(), "ROLE_STAFF", null,
                    null,
                    "{\"amount\":" + event.amount() + ",\"memberId\":\"" + event.memberId() + "\"}",
                    null,
                    event.tenantId()
            ));
        } catch (Exception e) {
            log.error("Failed to audit CASH_COLLECTED: {}", e.getMessage(), e);
        }
    }

    private void onPaymentCompleted(PaymentCompletedEvent event) {
        try {
            auditService.record(new AuditLogRequest(
                    "payment-service", "PAYMENT_BATCH", event.batchId(),
                    event.chitId(), "PAYMENT_COMPLETED",
                    event.completedByUserId(), "ROLE_ADMIN", null,
                    null,
                    "{\"amount\":" + event.amount() + ",\"mode\":\"" + event.paymentMode()
                            + "\",\"memberId\":\"" + event.memberId() + "\"}",
                    null,
                    event.tenantId()
            ));
        } catch (Exception e) {
            log.error("Failed to audit PAYMENT_COMPLETED: {}", e.getMessage(), e);
        }
    }
}
