package com.chitfund.notificationservice.kafka;

import com.chitfund.common.event.*;
import com.chitfund.notificationservice.domain.enums.NotificationEventType;
import com.chitfund.notificationservice.dto.request.NotifyRequest;
import com.chitfund.notificationservice.service.NotificationService;
import com.chitfund.notificationservice.websocket.WebSocketBroadcaster;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.awspring.cloud.sqs.annotation.SqsListener;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.UUID;

@Component
@RequiredArgsConstructor
@Slf4j
public class NotificationEventConsumer {

    private final NotificationService notificationService;
    private final com.chitfund.notificationservice.service.InAppNotificationService inAppService;
    private final ObjectMapper objectMapper;
    private final WebSocketBroadcaster broadcaster;

    @SqsListener(SqsQueues.MONTH_OPENED)
    public void onMonthOpened(String payload) {
        try {
            ChitMonthOpenedEvent event = objectMapper.readValue(payload, ChitMonthOpenedEvent.class);
            log.info("Sending PAYMENT_DUE notifications for chit {} month {} ({} members)",
                    event.chitId(), event.monthNumber(), event.memberIds().size());

            String amtFormatted = "₹" + event.installmentAmount().toPlainString();
            String chitLabel = event.chitName() != null ? event.chitName() : event.chitId();

            for (String memberId : event.memberIds()) {
                NotifyRequest req = buildRequest(
                        UUID.fromString(memberId),
                        null, null,
                        NotificationEventType.PAYMENT_DUE,
                        Map.of(
                                "amount",      event.installmentAmount().toPlainString(),
                                "chitName",    chitLabel,
                                "monthNumber", event.monthNumber().toString(),
                                "dueDate",     event.dueDate().toString()
                        )
                );
                notificationService.send(req);

                inAppService.create(
                    UUID.fromString(memberId),
                    "Installment Due",
                    amtFormatted + " due for month " + event.monthNumber() + " — " + chitLabel,
                    "PAYMENT_DUE",
                    Map.of("chitId", event.chitId(), "amount", event.installmentAmount().toPlainString(),
                           "monthNumber", event.monthNumber().toString())
                );
            }
            broadcaster.broadcast("DRAWS_UPDATED", Map.of("chitId", event.chitId()));
            broadcaster.broadcast("IN_APP_UPDATED");
        } catch (Exception e) {
            log.error("Failed to process MONTH_OPENED event: {}", e.getMessage(), e);
        }
    }

    @SqsListener(SqsQueues.MONTH_SKIPPED)
    public void onMonthSkipped(String payload) {
        try {
            ChitMonthSkippedEvent event = objectMapper.readValue(payload, ChitMonthSkippedEvent.class);
            log.info("Sending MONTH_SKIPPED notifications for chit {} month {} ({} members)",
                    event.chitId(), event.monthNumber(), event.memberIds().size());

            String chitLabel = event.chitName() != null ? event.chitName() : event.chitId();
            String reason    = event.skipReason() != null ? event.skipReason() : "Not specified";

            Map<String, String> params = Map.of(
                    "chitName",    chitLabel,
                    "monthNumber", event.monthNumber().toString(),
                    "reason",      reason
            );

            for (String memberId : event.memberIds()) {
                NotifyRequest req = buildRequest(
                        UUID.fromString(memberId), null, null,
                        NotificationEventType.MONTH_SKIPPED, params);
                notificationService.send(req);

                inAppService.create(
                    UUID.fromString(memberId),
                    "Month Skipped",
                    "Month " + event.monthNumber() + " of " + chitLabel + " was skipped. Reason: " + reason,
                    "MONTH_SKIPPED",
                    Map.of("chitId", event.chitId(), "monthNumber", event.monthNumber().toString(), "reason", reason)
                );
            }
            broadcaster.broadcast("DRAWS_UPDATED", Map.of("chitId", event.chitId()));
            broadcaster.broadcast("IN_APP_UPDATED");
        } catch (Exception e) {
            log.error("Failed to process MONTH_SKIPPED event: {}", e.getMessage(), e);
        }
    }

    @SqsListener(SqsQueues.CASH_COLLECTED)
    public void onCashCollected(String payload) {
        try {
            CashCollectedEvent event = objectMapper.readValue(payload, CashCollectedEvent.class);
            log.info("Cash collected alert: ₹{} from member {} by worker {}",
                    event.amount(), event.memberId(), event.collectedByUserId());

            String amtFormatted = "₹" + event.amount().toPlainString();

            NotifyRequest req = buildRequest(
                    UUID.fromString(event.collectedByUserId()),
                    null, null,
                    NotificationEventType.CASH_COLLECTED,
                    Map.of(
                            "workerId",   event.collectedByUserId(),
                            "amount",     event.amount().toPlainString(),
                            "memberId",   event.memberId(),
                            "chitId",     event.chitId()
                    )
            );
            notificationService.send(req);

            inAppService.create(
                UUID.fromString(event.collectedByUserId()),
                "Cash Collected",
                amtFormatted + " collected successfully",
                "CASH_COLLECTED",
                Map.of("memberId", event.memberId(), "chitId", event.chitId(),
                       "amount", event.amount().toPlainString(),
                       "workerId", event.collectedByUserId())
            );
            broadcaster.broadcast("CASH_REQUESTS_UPDATED");
            broadcaster.broadcast("PAYMENTS_UPDATED");
            broadcaster.broadcast("IN_APP_UPDATED");
        } catch (Exception e) {
            log.error("Failed to process CASH_COLLECTED event: {}", e.getMessage(), e);
        }
    }

    @SqsListener(SqsQueues.PAYMENT_COMPLETED)
    public void onPaymentCompleted(String payload) {
        try {
            PaymentCompletedEvent event = objectMapper.readValue(payload, PaymentCompletedEvent.class);
            String remaining = event.totalOutstanding().compareTo(java.math.BigDecimal.ZERO) > 0
                    ? "Remaining balance: ₹" + event.totalOutstanding().toPlainString()
                    : "Account is fully settled for this chit.";
            String amtFormatted = "₹" + event.amount().toPlainString();

            NotifyRequest req = buildRequest(
                    UUID.fromString(event.memberId()),
                    null, null,
                    NotificationEventType.PAYMENT_RECEIVED,
                    Map.of(
                            "amount",           event.amount().toPlainString(),
                            "chitId",           event.chitId(),
                            "monthNumber",      String.valueOf(event.monthsSettled()),
                            "remainingBalance", remaining
                    )
            );
            notificationService.send(req);

            inAppService.create(
                UUID.fromString(event.memberId()),
                "Payment Received",
                amtFormatted + " payment recorded. " + remaining,
                "PAYMENT_RECEIVED",
                Map.of("chitId", event.chitId(), "amount", event.amount().toPlainString(),
                       "monthsSettled", String.valueOf(event.monthsSettled()))
            );
            broadcaster.broadcast("PAYMENTS_UPDATED", Map.of("chitId", event.chitId()));
            broadcaster.broadcast("IN_APP_UPDATED");
        } catch (Exception e) {
            log.error("Failed to process PAYMENT_COMPLETED event: {}", e.getMessage(), e);
        }
    }

    @SqsListener(SqsQueues.PAYOUT_CREATED)
    public void onPayoutCreated(String payload) {
        try {
            PayoutCreatedEvent event = objectMapper.readValue(payload, PayoutCreatedEvent.class);
            String amtFormatted = "₹" + event.netPayoutAmount().toPlainString();

            NotifyRequest req = buildRequest(
                    UUID.fromString(event.memberId()),
                    null, null,
                    NotificationEventType.WINNER_SELECTED,
                    Map.of(
                            "chitId",      event.chitId(),
                            "monthNumber", event.monthNumber().toString(),
                            "amount",      event.netPayoutAmount().toPlainString()
                    )
            );
            notificationService.send(req);

            inAppService.create(
                UUID.fromString(event.memberId()),
                "🏆 You Won!",
                "Congratulations! Payout of " + amtFormatted + " approved for month " + event.monthNumber(),
                "WINNER_SELECTED",
                Map.of("chitId", event.chitId(), "amount", event.netPayoutAmount().toPlainString(),
                       "monthNumber", event.monthNumber().toString())
            );
            broadcaster.broadcast("PAYOUTS_UPDATED", Map.of("chitId", event.chitId()));
            broadcaster.broadcast("IN_APP_UPDATED");
        } catch (Exception e) {
            log.error("Failed to process PAYOUT_CREATED event: {}", e.getMessage(), e);
        }
    }

    @SqsListener(SqsQueues.PAYOUT_DISBURSED)
    public void onPayoutDisbursed(String payload) {
        try {
            PayoutDisbursedEvent event = objectMapper.readValue(payload, PayoutDisbursedEvent.class);
            String amtFormatted = "₹" + event.netPayoutAmount().toPlainString();
            String ref = event.referenceNumber() != null ? event.referenceNumber() : "N/A";

            NotifyRequest req = buildRequest(
                    UUID.fromString(event.memberId()),
                    null, null,
                    NotificationEventType.PAYOUT_DISBURSED,
                    Map.of(
                            "amount",    event.netPayoutAmount().toPlainString(),
                            "chitId",    event.chitId(),
                            "mode",      event.disbursementMode(),
                            "reference", ref
                    )
            );
            notificationService.send(req);

            inAppService.create(
                UUID.fromString(event.memberId()),
                "Payout Disbursed",
                amtFormatted + " sent via " + event.disbursementMode() + " (Ref: " + ref + ")",
                "PAYOUT_DISBURSED",
                Map.of("chitId", event.chitId(), "amount", event.netPayoutAmount().toPlainString(),
                       "mode", event.disbursementMode(), "reference", ref)
            );
            broadcaster.broadcast("PAYOUTS_UPDATED", Map.of("chitId", event.chitId()));
            broadcaster.broadcast("TREASURY_UPDATED");
            broadcaster.broadcast("IN_APP_UPDATED");
        } catch (Exception e) {
            log.error("Failed to process PAYOUT_DISBURSED event: {}", e.getMessage(), e);
        }
    }

    @SqsListener(SqsQueues.MEMBER_UPDATED)
    public void onMemberUpdated(String payload) {
        try {
            MemberUpdatedEvent event = objectMapper.readValue(payload, MemberUpdatedEvent.class);
            String newValue = event.newReferredByName() != null ? event.newReferredByName() : "None";
            String fieldLabel = "Referred by";

            inAppService.create(
                UUID.fromString(event.memberId()),
                "Profile Updated",
                "Your referral has been updated by an admin. Referred by: " + newValue,
                "PROFILE_UPDATED",
                Map.of("fieldChanged", fieldLabel, "newValue", newValue)
            );
            broadcaster.broadcast("IN_APP_UPDATED");
        } catch (Exception e) {
            log.error("Failed to process MEMBER_UPDATED event: {}", e.getMessage(), e);
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
