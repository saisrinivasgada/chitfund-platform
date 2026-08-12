package com.chitfund.reportingservice.kafka;

import com.chitfund.common.event.*;
import com.chitfund.reportingservice.dto.ingest.CollectionSnapshotEvent;
import com.chitfund.reportingservice.dto.ingest.MemberPaymentEvent;
import com.chitfund.reportingservice.dto.ingest.PayoutEvent;
import com.chitfund.reportingservice.service.ReportIngestService;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;

@Component
@RequiredArgsConstructor
@Slf4j
public class ReportingEventConsumer {

    private final ReportIngestService ingestService;
    private final ObjectMapper objectMapper;

    @KafkaListener(topics = KafkaTopics.MONTH_OPENED, groupId = "reporting-service")
    public void onMonthOpened(String payload) {
        try {
            ChitMonthOpenedEvent event = objectMapper.readValue(payload, ChitMonthOpenedEvent.class);
            BigDecimal totalOutstanding = event.installmentAmount()
                    .multiply(BigDecimal.valueOf(event.totalMembers()));
            ingestService.ingestCollectionSnapshot(new CollectionSnapshotEvent(
                    event.chitId(), event.chitName(), event.monthNumber(), event.dueDate(),
                    event.installmentAmount(), event.totalMembers(),
                    0, 0, event.totalMembers(), 0,
                    BigDecimal.ZERO, totalOutstanding,
                    "OPEN", null, event.tenantId()
            ));
        } catch (Exception e) {
            log.error("Failed to process MONTH_OPENED for reporting: {}", e.getMessage(), e);
        }
    }

    @KafkaListener(topics = KafkaTopics.MONTH_SKIPPED, groupId = "reporting-service")
    public void onMonthSkipped(String payload) {
        try {
            ChitMonthSkippedEvent event = objectMapper.readValue(payload, ChitMonthSkippedEvent.class);
            ingestService.ingestCollectionSnapshot(new CollectionSnapshotEvent(
                    event.chitId(), event.chitName(), event.monthNumber(), event.dueDate(),
                    event.installmentAmount(), event.totalMembers(),
                    0, 0, 0, event.totalMembers(),
                    BigDecimal.ZERO, BigDecimal.ZERO,
                    "SKIPPED", event.skipReason(), event.tenantId()
            ));
        } catch (Exception e) {
            log.error("Failed to process MONTH_SKIPPED for reporting: {}", e.getMessage(), e);
        }
    }

    @KafkaListener(topics = KafkaTopics.PAYMENT_COMPLETED, groupId = "reporting-service")
    public void onPaymentCompleted(String payload) {
        try {
            PaymentCompletedEvent event = objectMapper.readValue(payload, PaymentCompletedEvent.class);
            ingestService.ingestMemberPayment(new MemberPaymentEvent(
                    event.memberId(), event.chitId(),
                    null, null,                        // memberName and phone not in payment events
                    event.totalDue(), event.totalPaid(), event.totalOutstanding(),
                    event.monthsSettled(), event.monthsPartiallyPaid(),
                    event.monthsOutstanding(), event.monthsWaived(),
                    event.lastPaymentDate(), event.amount(), event.tenantId()
            ));
        } catch (Exception e) {
            log.error("Failed to process PAYMENT_COMPLETED for reporting: {}", e.getMessage(), e);
        }
    }

    @KafkaListener(topics = KafkaTopics.PAYOUT_CREATED, groupId = "reporting-service")
    public void onPayoutCreated(String payload) {
        try {
            PayoutCreatedEvent event = objectMapper.readValue(payload, PayoutCreatedEvent.class);
            ingestService.ingestPayout(new PayoutEvent(
                    event.chitId(), event.memberId(), null,
                    event.monthNumber(), event.winningAmount(), event.discountAmount(),
                    event.netPayoutAmount(), "PENDING", null, null, event.tenantId()
            ));
        } catch (Exception e) {
            log.error("Failed to process PAYOUT_CREATED for reporting: {}", e.getMessage(), e);
        }
    }

    @KafkaListener(topics = KafkaTopics.PAYOUT_DISBURSED, groupId = "reporting-service")
    public void onPayoutDisbursed(String payload) {
        try {
            PayoutDisbursedEvent event = objectMapper.readValue(payload, PayoutDisbursedEvent.class);
            ingestService.ingestPayout(new PayoutEvent(
                    event.chitId(), event.memberId(), null,
                    event.monthNumber(), null, null,
                    event.netPayoutAmount(), "DISBURSED",
                    event.disbursementMode(),
                    event.occurredAt() != null
                            ? java.time.LocalDate.ofInstant(event.occurredAt(), java.time.ZoneOffset.UTC)
                            : java.time.LocalDate.now(),
                    event.tenantId()
            ));
        } catch (Exception e) {
            log.error("Failed to process PAYOUT_DISBURSED for reporting: {}", e.getMessage(), e);
        }
    }
}
