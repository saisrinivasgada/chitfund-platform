package com.chitfund.notificationservice.kafka;

import com.chitfund.common.event.*;
import com.chitfund.notificationservice.client.ChitServiceClient;
import com.chitfund.notificationservice.client.MemberServiceClient;
import com.chitfund.notificationservice.client.UserServiceClient;
import com.chitfund.notificationservice.domain.enums.NotificationEventType;
import com.chitfund.notificationservice.dto.request.NotifyRequest;
import com.chitfund.notificationservice.service.NotificationService;
import com.chitfund.notificationservice.websocket.WebSocketBroadcaster;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.awspring.cloud.sqs.annotation.SqsListener;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.util.List;
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
    private final MemberServiceClient memberServiceClient;
    private final UserServiceClient userServiceClient;
    private final ChitServiceClient chitServiceClient;

    @SqsListener(SqsQueues.NOTIFICATION_EVENTS)
    public void onEvent(String raw) {
        try {
            SqsEventEnvelope envelope = objectMapper.readValue(raw, SqsEventEnvelope.class);
            switch (envelope.eventType()) {
                case SqsQueues.EVT_MONTH_OPENED ->
                    onMonthOpened(objectMapper.readValue(envelope.payload(), ChitMonthOpenedEvent.class));
                case SqsQueues.EVT_MONTH_SKIPPED ->
                    onMonthSkipped(objectMapper.readValue(envelope.payload(), ChitMonthSkippedEvent.class));
                case SqsQueues.EVT_CASH_COLLECTED ->
                    onCashCollected(objectMapper.readValue(envelope.payload(), CashCollectedEvent.class));
                case SqsQueues.EVT_PAYMENT_COMPLETED ->
                    onPaymentCompleted(objectMapper.readValue(envelope.payload(), PaymentCompletedEvent.class));
                case SqsQueues.EVT_PAYOUT_CREATED ->
                    onPayoutCreated(objectMapper.readValue(envelope.payload(), PayoutCreatedEvent.class));
                case SqsQueues.EVT_PAYOUT_DISBURSED ->
                    onPayoutDisbursed(objectMapper.readValue(envelope.payload(), PayoutDisbursedEvent.class));
                case SqsQueues.EVT_MEMBER_UPDATED ->
                    onMemberUpdated(objectMapper.readValue(envelope.payload(), MemberUpdatedEvent.class));
                case SqsQueues.EVT_CASH_REQUEST_EVENT ->
                    onCashRequestEvent(objectMapper.readValue(envelope.payload(), CashRequestEvent.class));
                default ->
                    log.warn("Unknown notification event type: {}", envelope.eventType());
            }
        } catch (Exception e) {
            log.error("Failed to process notification event: {}", e.getMessage(), e);
        }
    }

    // ── Month opened — all members get "installment due" alert ───────────────

    private void onMonthOpened(ChitMonthOpenedEvent event) {
        try {
            log.info("Sending PAYMENT_DUE notifications for chit {} month {} ({} members)",
                    event.chitId(), event.monthNumber(), event.memberIds().size());

            String amtFormatted = "₹" + event.installmentAmount().toPlainString();
            String chitLabel = event.chitName() != null ? event.chitName() : event.chitId();

            Map<String, String> userIdMap = memberServiceClient.batchGetUserIds(event.memberIds());

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

                String userId = userIdMap.get(memberId);
                if (userId != null) {
                    inAppService.create(
                        UUID.fromString(userId),
                        "Installment Due",
                        amtFormatted + " due for draw " + event.monthNumber() + " — " + chitLabel,
                        "PAYMENT_DUE",
                        Map.of("chitId", event.chitId(), "amount", event.installmentAmount().toPlainString(),
                               "monthNumber", event.monthNumber().toString()),
                        "/member/chits/" + event.chitId()
                    );
                }
            }
            broadcaster.broadcast("DRAWS_UPDATED", Map.of("chitId", event.chitId()));
            broadcaster.broadcast("IN_APP_UPDATED");
        } catch (Exception e) {
            log.error("Failed to process MONTH_OPENED event: {}", e.getMessage(), e);
        }
    }

    // ── Month skipped ─────────────────────────────────────────────────────────

    private void onMonthSkipped(ChitMonthSkippedEvent event) {
        try {
            log.info("Sending MONTH_SKIPPED notifications for chit {} month {} ({} members)",
                    event.chitId(), event.monthNumber(), event.memberIds().size());

            String chitLabel = event.chitName() != null ? event.chitName() : event.chitId();
            String reason    = event.skipReason() != null ? event.skipReason() : "Not specified";

            Map<String, String> params = Map.of(
                    "chitName",    chitLabel,
                    "monthNumber", event.monthNumber().toString(),
                    "reason",      reason
            );
            Map<String, String> userIdMap = memberServiceClient.batchGetUserIds(event.memberIds());

            for (String memberId : event.memberIds()) {
                NotifyRequest req = buildRequest(
                        UUID.fromString(memberId), null, null,
                        NotificationEventType.MONTH_SKIPPED, params);
                notificationService.send(req);

                String userId = userIdMap.get(memberId);
                if (userId != null) {
                    inAppService.create(
                        UUID.fromString(userId),
                        "Draw Skipped",
                        "Draw " + event.monthNumber() + " of " + chitLabel + " was skipped. Reason: " + reason,
                        "MONTH_SKIPPED",
                        Map.of("chitId", event.chitId(), "monthNumber", event.monthNumber().toString(), "reason", reason),
                        "/member/chits/" + event.chitId()
                    );
                }
            }
            broadcaster.broadcast("DRAWS_UPDATED", Map.of("chitId", event.chitId()));
            broadcaster.broadcast("IN_APP_UPDATED");
        } catch (Exception e) {
            log.error("Failed to process MONTH_SKIPPED event: {}", e.getMessage(), e);
        }
    }

    // ── Cash collected (worker confirms pickup to admin) ──────────────────────

    private void onCashCollected(CashCollectedEvent event) {
        try {
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
                       "workerId", event.collectedByUserId()),
                "/member?tab=requests"
            );
            broadcaster.broadcast("CASH_REQUESTS_UPDATED");
            broadcaster.broadcast("PAYMENTS_UPDATED");
            broadcaster.broadcast("IN_APP_UPDATED");
        } catch (Exception e) {
            log.error("Failed to process CASH_COLLECTED event: {}", e.getMessage(), e);
        }
    }

    // ── Payment completed — member gets receipt ────────────────────────────────

    private void onPaymentCompleted(PaymentCompletedEvent event) {
        try {
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

            String userId = memberServiceClient.getUserId(event.memberId());
            if (userId != null) {
                inAppService.create(
                    UUID.fromString(userId),
                    "Payment Received",
                    amtFormatted + " payment recorded. " + remaining,
                    "PAYMENT_RECEIVED",
                    Map.of("chitId", event.chitId(), "amount", event.amount().toPlainString(),
                           "monthsSettled", String.valueOf(event.monthsSettled())),
                    "/member/chits/" + event.chitId()
                );
            }
            broadcaster.broadcast("PAYMENTS_UPDATED", Map.of("chitId", event.chitId()));
            broadcaster.broadcast("IN_APP_UPDATED");
        } catch (Exception e) {
            log.error("Failed to process PAYMENT_COMPLETED event: {}", e.getMessage(), e);
        }
    }

    // ── Payout created — winner notified + all chit members get draw result ───

    private void onPayoutCreated(PayoutCreatedEvent event) {
        try {
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

            String winnerUserId = memberServiceClient.getUserId(event.memberId());
            if (winnerUserId != null) {
                inAppService.create(
                    UUID.fromString(winnerUserId),
                    "You Won the Draw!",
                    "Congratulations! Payout of " + amtFormatted + " approved for month " + event.monthNumber(),
                    "WINNER_SELECTED",
                    Map.of("chitId", event.chitId(), "amount", event.netPayoutAmount().toPlainString(),
                           "monthNumber", event.monthNumber().toString()),
                    "/member/chits/" + event.chitId()
                );
            }

            List<String> allMemberIds = chitServiceClient.getActiveMemberIds(event.chitId());
            Map<String, String> userIdMap = memberServiceClient.batchGetUserIds(allMemberIds);
            for (String memberId : allMemberIds) {
                if (memberId.equals(event.memberId())) continue;
                String userId = userIdMap.get(memberId);
                if (userId != null) {
                    inAppService.create(
                        UUID.fromString(userId),
                        "Draw Result — Draw " + event.monthNumber(),
                        "Draw " + event.monthNumber() + " is complete. Payout approved.",
                        "DRAW_RESULT",
                        Map.of("chitId", event.chitId(), "monthNumber", event.monthNumber().toString()),
                        "/member/chits/" + event.chitId()
                    );
                }
            }

            broadcaster.broadcast("PAYOUTS_UPDATED", Map.of("chitId", event.chitId()));
            broadcaster.broadcast("IN_APP_UPDATED");
        } catch (Exception e) {
            log.error("Failed to process PAYOUT_CREATED event: {}", e.getMessage(), e);
        }
    }

    // ── Payout disbursed — member gets disbursement confirmation ──────────────

    private void onPayoutDisbursed(PayoutDisbursedEvent event) {
        try {
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

            String userId = memberServiceClient.getUserId(event.memberId());
            if (userId != null) {
                inAppService.create(
                    UUID.fromString(userId),
                    "Payout Disbursed",
                    amtFormatted + " sent via " + event.disbursementMode() + " (Ref: " + ref + ")",
                    "PAYOUT_DISBURSED",
                    Map.of("chitId", event.chitId(), "amount", event.netPayoutAmount().toPlainString(),
                           "mode", event.disbursementMode(), "reference", ref),
                    "/member/chits/" + event.chitId()
                );
            }
            broadcaster.broadcast("PAYOUTS_UPDATED", Map.of("chitId", event.chitId()));
            broadcaster.broadcast("TREASURY_UPDATED");
            broadcaster.broadcast("IN_APP_UPDATED");
        } catch (Exception e) {
            log.error("Failed to process PAYOUT_DISBURSED event: {}", e.getMessage(), e);
        }
    }

    // ── Member profile updated ────────────────────────────────────────────────

    private void onMemberUpdated(MemberUpdatedEvent event) {
        try {
            String newValue = event.newReferredByName() != null ? event.newReferredByName() : "None";

            String userId = memberServiceClient.getUserId(event.memberId());
            if (userId != null) {
                inAppService.create(
                    UUID.fromString(userId),
                    "Profile Updated",
                    "Your referral has been updated by an admin. Referred by: " + newValue,
                    "PROFILE_UPDATED",
                    Map.of("fieldChanged", "Referred by", "newValue", newValue),
                    "/member"
                );
            }
            broadcaster.broadcast("IN_APP_UPDATED");
        } catch (Exception e) {
            log.error("Failed to process MEMBER_UPDATED event: {}", e.getMessage(), e);
        }
    }

    // ── Cash request lifecycle — member + worker + admin notifications ─────────

    private void onCashRequestEvent(CashRequestEvent event) {
        try {
            log.info("Cash request event: {} for request {}", event.eventType(), event.requestId());

            switch (event.eventType()) {
                case "CREATED" -> handleCashRequestCreated(event);
                case "ASSIGNED" -> handleCashRequestAssigned(event);
                case "PICKED_UP" -> handleCashRequestPickedUp(event);
                case "COLLECTED" -> handleCashRequestCollected(event);
                case "PARTIALLY_COLLECTED" -> handleCashRequestPartiallyCollected(event);
                case "MEMBER_APPROVED" -> handleMemberApproval(event, true);
                case "MEMBER_REJECTED" -> handleMemberApproval(event, false);
                default -> log.warn("Unknown cash request event type: {}", event.eventType());
            }

            broadcaster.broadcast("CASH_REQUESTS_UPDATED");
            broadcaster.broadcast("IN_APP_UPDATED");
        } catch (Exception e) {
            log.error("Failed to process CASH_REQUEST_EVENT: {}", e.getMessage(), e);
        }
    }

    private void handleCashRequestCreated(CashRequestEvent event) {
        String memberDisplay = event.memberName() != null && !event.memberName().isBlank()
                ? event.memberName() : "A member";
        String amtStr = event.amount() != null ? " ₹" + event.amount().toPlainString() : "";

        if (event.memberUserId() != null) {
            inAppService.create(
                UUID.fromString(event.memberUserId()),
                "Cash Pickup Requested",
                "Your cash pickup request" + amtStr + " has been submitted and is pending assignment.",
                "CASH_REQUEST_SUBMITTED",
                Map.of("requestId", event.requestId()),
                "/member?tab=requests"
            );
        }

        notifyAdminsAndManagers(
            "New Cash Pickup Request",
            memberDisplay + " has requested a cash pickup" + amtStr + ". Assign a staff member.",
            "CASH_REQUEST_SUBMITTED",
            Map.of("requestId", event.requestId()),
            "/payments"
        );
    }

    private void handleCashRequestAssigned(CashRequestEvent event) {
        String staffDisplay = event.staffName() != null && !event.staffName().isBlank()
                ? event.staffName() : "A staff member";
        String memberDisplay = event.memberName() != null && !event.memberName().isBlank()
                ? event.memberName() : "a member";
        String amtStr = event.amount() != null ? " ₹" + event.amount().toPlainString() : "";

        if (event.memberUserId() != null) {
            inAppService.create(
                UUID.fromString(event.memberUserId()),
                "Staff Assigned",
                staffDisplay + " has been assigned to collect your cash payment" + amtStr + " and will contact you shortly.",
                "CASH_REQUEST_ASSIGNED",
                Map.of("requestId", event.requestId()),
                "/member?tab=requests"
            );
        }

        if (event.staffId() != null) {
            inAppService.create(
                UUID.fromString(event.staffId()),
                "New Cash Pickup Task",
                "You have been assigned to collect cash" + amtStr + " from " + memberDisplay + ". Check your tasks.",
                "CASH_REQUEST_ASSIGNED",
                Map.of("requestId", event.requestId()),
                "/tasks"
            );
        }
    }

    private void handleCashRequestPickedUp(CashRequestEvent event) {
        String workerDisplay = event.staffName() != null && !event.staffName().isBlank()
                ? event.staffName() : "A staff member";
        String memberDisplay = event.memberName() != null && !event.memberName().isBlank()
                ? event.memberName() : "a member";
        String amtStr = event.amount() != null ? " ₹" + event.amount().toPlainString() : "";

        if (event.memberUserId() != null) {
            inAppService.create(
                UUID.fromString(event.memberUserId()),
                "Cash Picked Up",
                workerDisplay + " has picked up your cash payment" + amtStr + ". You'll be notified once admin confirms receipt.",
                "CASH_REQUEST_PICKED_UP",
                Map.of("requestId", event.requestId()),
                "/member?tab=requests"
            );
        }

        notifyAdminsAndManagers(
            "Cash Ready to Confirm",
            workerDisplay + " has picked up" + amtStr + " from " + memberDisplay + ". Please confirm receipt.",
            "CASH_REQUEST_PICKED_UP",
            Map.of("requestId", event.requestId()),
            "/payments"
        );
    }

    private void handleCashRequestCollected(CashRequestEvent event) {
        String amtStr = event.amount() != null ? "₹" + event.amount().toPlainString() : "Cash";

        if (event.memberUserId() != null) {
            inAppService.create(
                UUID.fromString(event.memberUserId()),
                "Payment Confirmed",
                amtStr + " confirmed by admin. Your account has been credited.",
                "CASH_COLLECTED",
                Map.of("requestId", event.requestId()),
                "/member?tab=requests"
            );
        }

        if (event.staffId() != null) {
            inAppService.create(
                UUID.fromString(event.staffId()),
                "Collection Confirmed",
                "Admin confirmed your cash handover of " + amtStr + ". Task complete.",
                "CASH_COLLECTED",
                Map.of("requestId", event.requestId()),
                "/tasks"
            );
        }
    }

    private void handleCashRequestPartiallyCollected(CashRequestEvent event) {
        String workerDisplay = event.staffName() != null && !event.staffName().isBlank()
                ? event.staffName() : "A staff member";
        String memberDisplay = event.memberName() != null && !event.memberName().isBlank()
                ? event.memberName() : "a member";

        BigDecimal collected = event.collectedAmount();
        BigDecimal requested = event.amount();
        String collectedStr = collected != null ? "₹" + collected.toPlainString() : "part";
        String requestedStr = requested != null ? " of ₹" + requested.toPlainString() : "";

        if (event.memberUserId() != null) {
            inAppService.create(
                UUID.fromString(event.memberUserId()),
                "Partial Cash Pickup — Action Needed",
                workerDisplay + " collected " + collectedStr + requestedStr + " from you. Please approve or reject on your requests page.",
                "CASH_REQUEST_PARTIAL",
                Map.of("requestId", event.requestId()),
                "/member?tab=requests"
            );
        }

        notifyAdminsAndManagers(
            "Partial Cash Pickup Recorded",
            workerDisplay + " collected " + collectedStr + requestedStr + " from " + memberDisplay + ". Awaiting member approval.",
            "CASH_REQUEST_PARTIAL",
            Map.of("requestId", event.requestId()),
            "/payments"
        );
    }

    private void handleMemberApproval(CashRequestEvent event, boolean approved) {
        String memberDisplay = event.memberName() != null && !event.memberName().isBlank()
                ? event.memberName() : "Member";
        BigDecimal collected = event.collectedAmount();
        String collectedStr = collected != null ? "₹" + collected.toPlainString() : "cash";
        String extraData = event.extraData();

        if (approved) {
            notifyAdminsAndManagers(
                "Member Approved Partial Collection",
                memberDisplay + " confirmed " + collectedStr + " was collected. Proceed to remit.",
                "MEMBER_APPROVED_PARTIAL",
                Map.of("requestId", event.requestId()),
                "/payments"
            );
            if (event.staffId() != null) {
                inAppService.create(
                    UUID.fromString(event.staffId()),
                    "Member Approved Your Collection",
                    memberDisplay + " confirmed " + collectedStr + ". Admin will remit soon.",
                    "MEMBER_APPROVED_PARTIAL",
                    Map.of("requestId", event.requestId()),
                    "/tasks"
                );
            }
        } else {
            String reasonStr = extraData != null && !extraData.isBlank() ? " Reason: " + extraData : "";
            notifyAdminsAndManagers(
                "Member Disputed Partial Collection",
                memberDisplay + " rejected the " + collectedStr + " partial collection." + reasonStr + " Review and edit if needed.",
                "MEMBER_REJECTED_PARTIAL",
                Map.of("requestId", event.requestId()),
                "/payments"
            );
            if (event.staffId() != null) {
                inAppService.create(
                    UUID.fromString(event.staffId()),
                    "Member Disputed Your Collection",
                    memberDisplay + " rejected the partial collection." + reasonStr,
                    "MEMBER_REJECTED_PARTIAL",
                    Map.of("requestId", event.requestId()),
                    "/tasks"
                );
            }
        }
    }

    private void notifyAdminsAndManagers(String title, String message, String type,
                                          Map<String, String> metadata, String link) {
        List<String> adminIds = userServiceClient.getUserIdsByRole("ADMIN");
        List<String> managerIds = userServiceClient.getUserIdsByRole("MANAGER");

        for (String userId : adminIds) {
            inAppService.create(UUID.fromString(userId), title, message, type, metadata, link);
        }
        for (String userId : managerIds) {
            inAppService.create(UUID.fromString(userId), title, message, type, metadata, link);
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
