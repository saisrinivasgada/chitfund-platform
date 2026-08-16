package com.chitfund.reportingservice.kafka;

import com.chitfund.common.event.*;
import com.chitfund.reportingservice.dto.ingest.CollectionSnapshotEvent;
import com.chitfund.reportingservice.dto.ingest.MemberPaymentEvent;
import com.chitfund.reportingservice.dto.ingest.PayoutEvent;
import com.chitfund.reportingservice.service.ReportIngestService;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.awspring.cloud.sqs.annotation.SqsListener;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.ZoneOffset;

@Component
@RequiredArgsConstructor
@Slf4j
public class ReportingEventConsumer {

    private final ReportIngestService ingestService;
    private final ObjectMapper objectMapper;

    @SqsListener(SqsQueues.REPORTING_EVENTS)
    public void onEvent(String raw) {
        try {
            SqsEventEnvelope envelope = objectMapper.readValue(raw, SqsEventEnvelope.class);
            switch (envelope.eventType()) {
                case SqsQueues.EVT_MONTH_OPENED ->
                    onMonthOpened(objectMapper.readValue(envelope.payload(), ChitMonthOpenedEvent.class));
                case SqsQueues.EVT_MONTH_SKIPPED ->
                    onMonthSkipped(objectMapper.readValue(envelope.payload(), ChitMonthSkippedEvent.class));
                case SqsQueues.EVT_PAYMENT_COMPLETED ->
                    onPaymentCompleted(objectMapper.readValue(envelope.payload(), PaymentCompletedEvent.class));
                case SqsQueues.EVT_PAYOUT_CREATED ->
                    onPayoutCreated(objectMapper.readValue(envelope.payload(), PayoutCreatedEvent.class));
                case SqsQueues.EVT_PAYOUT_DISBURSED ->
                    onPayoutDisbursed(objectMapper.readValue(envelope.payload(), PayoutDisbursedEvent.class));
                default ->
                    log.debug("Ignored event type: {}", envelope.eventType());
            }
        } catch (Exception e) {
            log.error("Failed to process reporting event: {}", e.getMessage(), e);
        }
    }

    private void onMonthOpened(ChitMonthOpenedEvent event) {
        BigDecimal totalOutstanding = event.installmentAmount()
                .multiply(BigDecimal.valueOf(event.totalMembers()));
        ingestService.ingestCollectionSnapshot(new CollectionSnapshotEvent(
                event.chitId(), event.chitName(), event.monthNumber(), event.dueDate(),
                event.installmentAmount(), event.totalMembers(),
                0, 0, event.totalMembers(), 0,
                BigDecimal.ZERO, totalOutstanding,
                "OPEN", null, event.tenantId()
        ));
    }

    private void onMonthSkipped(ChitMonthSkippedEvent event) {
        ingestService.ingestCollectionSnapshot(new CollectionSnapshotEvent(
                event.chitId(), event.chitName(), event.monthNumber(), event.dueDate(),
                event.installmentAmount(), event.totalMembers(),
                0, 0, 0, event.totalMembers(),
                BigDecimal.ZERO, BigDecimal.ZERO,
                "SKIPPED", event.skipReason(), event.tenantId()
        ));
    }

    private void onPaymentCompleted(PaymentCompletedEvent event) {
        ingestService.ingestMemberPayment(new MemberPaymentEvent(
                event.memberId(), event.chitId(),
                null, null,
                event.totalDue(), event.totalPaid(), event.totalOutstanding(),
                event.monthsSettled(), event.monthsPartiallyPaid(),
                event.monthsOutstanding(), event.monthsWaived(),
                event.lastPaymentDate(), event.amount(), event.tenantId()
        ));
    }

    private void onPayoutCreated(PayoutCreatedEvent event) {
        ingestService.ingestPayout(new PayoutEvent(
                event.chitId(), event.memberId(), null,
                event.monthNumber(), event.winningAmount(), event.discountAmount(),
                event.netPayoutAmount(), "PENDING", null, null, event.tenantId()
        ));
    }

    private void onPayoutDisbursed(PayoutDisbursedEvent event) {
        ingestService.ingestPayout(new PayoutEvent(
                event.chitId(), event.memberId(), null,
                event.monthNumber(), null, null,
                event.netPayoutAmount(), "DISBURSED",
                event.disbursementMode(),
                event.occurredAt() != null
                        ? LocalDate.ofInstant(event.occurredAt(), ZoneOffset.UTC)
                        : LocalDate.now(),
                event.tenantId()
        ));
    }
}
