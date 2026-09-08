package com.chitfund.notificationservice.kafka;

import com.chitfund.common.event.*;
import com.chitfund.notificationservice.client.ChitServiceClient;
import com.chitfund.notificationservice.client.MemberServiceClient;
import com.chitfund.notificationservice.client.UserServiceClient;
import com.chitfund.notificationservice.domain.enums.NotificationEventType;
import com.chitfund.notificationservice.dto.request.NotifyRequest;
import com.chitfund.notificationservice.service.ExpoPushService;
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
    private final ExpoPushService pushService;
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
                    String title = "Installment Due";
                    String body  = amtFormatted + " due for draw " + event.monthNumber() + " — " + chitLabel;
                    inAppService.create(
                        UUID.fromString(userId), title, body, "PAYMENT_DUE",
                        Map.of("chitId", event.chitId(), "amount", event.installmentAmount().toPlainString(),
                               "monthNumber", event.monthNumber().toString()),
                        "/member/chits/" + event.chitId()
                    );
                    pushService.sendToUser(UUID.fromString(userId), title, body);
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
                    String title = "Draw Skipped";
                    String body  = "Draw " + event.monthNumber() + " of " + chitLabel + " was skipped. Reason: " + reason;
                    inAppService.create(
                        UUID.fromString(userId), title, body, "MONTH_SKIPPED",
                        Map.of("chitId", event.chitId(), "monthNumber", event.monthNumber().toString(), "reason", reason),
                        "/member/chits/" + event.chitId()
                    );
                    pushService.sendToUser(UUID.fromString(userId), title, body);
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

            String cashTitle = "Cash Collected";
            String cashBody  = amtFormatted + " collected successfully";
            inAppService.create(
                UUID.fromString(event.collectedByUserId()),
                cashTitle, cashBody, "CASH_COLLECTED",
                Map.of("memberId", event.memberId(), "chitId", event.chitId(),
                       "amount", event.amount().toPlainString(),
                       "workerId", event.collectedByUserId()),
                "/member?tab=requests"
            );
            pushService.sendToUser(UUID.fromString(event.collectedByUserId()), cashTitle, cashBody);
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
                String title = "Payment Received";
                String body  = amtFormatted + " payment recorded. " + remaining;
                inAppService.create(
                    UUID.fromString(userId), title, body, "PAYMENT_RECEIVED",
                    Map.of("chitId", event.chitId(), "amount", event.amount().toPlainString(),
                           "monthsSettled", String.valueOf(event.monthsSettled())),
                    "/member/chits/" + event.chitId()
                );
                pushService.sendToUser(UUID.fromString(userId), title, body);
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
                String title = "You Won the Draw!";
                String body  = "Congratulations! Payout of " + amtFormatted + " approved for month " + event.monthNumber();
                inAppService.create(
                    UUID.fromString(winnerUserId), title, body, "WINNER_SELECTED",
                    Map.of("chitId", event.chitId(), "amount", event.netPayoutAmount().toPlainString(),
                           "monthNumber", event.monthNumber().toString()),
                    "/member/chits/" + event.chitId()
                );
                pushService.sendToUser(UUID.fromString(winnerUserId), title, body);
            }

            List<String> allMemberIds = chitServiceClient.getActiveMemberIds(event.chitId());
            Map<String, String> userIdMap = memberServiceClient.batchGetUserIds(allMemberIds);
            for (String memberId : allMemberIds) {
                if (memberId.equals(event.memberId())) continue;
                String userId = userIdMap.get(memberId);
                if (userId != null) {
                    String title = "Draw Result — Draw " + event.monthNumber();
                    String body  = "Draw " + event.monthNumber() + " is complete. Payout approved.";
                    inAppService.create(
                        UUID.fromString(userId), title, body, "DRAW_RESULT",
                        Map.of("chitId", event.chitId(), "monthNumber", event.monthNumber().toString()),
                        "/member/chits/" + event.chitId()
                    );
                    pushService.sendToUser(UUID.fromString(userId), title, body);
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
                String title = "Payout Disbursed";
                String body  = amtFormatted + " sent via " + event.disbursementMode() + " (Ref: " + ref + ")";
                inAppService.create(
                    UUID.fromString(userId), title, body, "PAYOUT_DISBURSED",
                    Map.of("chitId", event.chitId(), "amount", event.netPayoutAmount().toPlainString(),
                           "mode", event.disbursementMode(), "reference", ref),
                    "/member/chits/" + event.chitId()
                );
                pushService.sendToUser(UUID.fromString(userId), title, body);
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
                String title = "Profile Updated";
                String body  = "Your referral has been updated by an admin. Referred by: " + newValue;
                inAppService.create(
                    UUID.fromString(userId), title, body, "PROFILE_UPDATED",
                    Map.of("fieldChanged", "Referred by", "newValue", newValue),
                    "/member"
                );
                pushService.sendToUser(UUID.fromString(userId), title, body);
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
            String title = "Cash Pickup Requested";
            String body  = "Your cash pickup request" + amtStr + " has been submitted and is pending assignment.";
            inAppService.create(
                UUID.fromString(event.memberUserId()), title, body, "CASH_REQUEST_SUBMITTED",
                Map.of("requestId", event.requestId()), "/member?tab=requests"
            );
            pushService.sendToUser(UUID.fromString(event.memberUserId()), title, body);
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
            String title = "Staff Assigned";
            String body  = staffDisplay + " has been assigned to collect your cash payment" + amtStr + " and will contact you shortly.";
            inAppService.create(UUID.fromString(event.memberUserId()), title, body, "CASH_REQUEST_ASSIGNED",
                Map.of("requestId", event.requestId()), "/member?tab=requests");
            pushService.sendToUser(UUID.fromString(event.memberUserId()), title, body);
        }

        if (event.staffId() != null) {
            String title = "New Cash Pickup Task";
            String body  = "You have been assigned to collect cash" + amtStr + " from " + memberDisplay + ". Check your tasks.";
            inAppService.create(UUID.fromString(event.staffId()), title, body, "CASH_REQUEST_ASSIGNED",
                Map.of("requestId", event.requestId()), "/tasks");
            pushService.sendToUser(UUID.fromString(event.staffId()), title, body);
        }
    }

    private void handleCashRequestPickedUp(CashRequestEvent event) {
        String workerDisplay = event.staffName() != null && !event.staffName().isBlank()
                ? event.staffName() : "A staff member";
        String memberDisplay = event.memberName() != null && !event.memberName().isBlank()
                ? event.memberName() : "a member";
        String amtStr = event.amount() != null ? " ₹" + event.amount().toPlainString() : "";

        if (event.memberUserId() != null) {
            String title = "Cash Picked Up";
            String body  = workerDisplay + " has picked up your cash payment" + amtStr + ". You'll be notified once admin confirms receipt.";
            inAppService.create(UUID.fromString(event.memberUserId()), title, body, "CASH_REQUEST_PICKED_UP",
                Map.of("requestId", event.requestId()), "/member?tab=requests");
            pushService.sendToUser(UUID.fromString(event.memberUserId()), title, body);
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
            String title = "Payment Confirmed";
            String body  = amtStr + " confirmed by admin. Your account has been credited.";
            inAppService.create(UUID.fromString(event.memberUserId()), title, body, "CASH_COLLECTED",
                Map.of("requestId", event.requestId()), "/member?tab=requests");
            pushService.sendToUser(UUID.fromString(event.memberUserId()), title, body);
        }

        if (event.staffId() != null) {
            String title = "Collection Confirmed";
            String body  = "Admin confirmed your cash handover of " + amtStr + ". Task complete.";
            inAppService.create(UUID.fromString(event.staffId()), title, body, "CASH_COLLECTED",
                Map.of("requestId", event.requestId()), "/tasks");
            pushService.sendToUser(UUID.fromString(event.staffId()), title, body);
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
            String title = "Partial Cash Pickup — Action Needed";
            String body  = workerDisplay + " collected " + collectedStr + requestedStr + " from you. Please approve or reject on your requests page.";
            inAppService.create(UUID.fromString(event.memberUserId()), title, body, "CASH_REQUEST_PARTIAL",
                Map.of("requestId", event.requestId()), "/member?tab=requests");
            pushService.sendToUser(UUID.fromString(event.memberUserId()), title, body);
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
                String title = "Member Approved Your Collection";
                String body  = memberDisplay + " confirmed " + collectedStr + ". Admin will remit soon.";
                inAppService.create(UUID.fromString(event.staffId()), title, body, "MEMBER_APPROVED_PARTIAL",
                    Map.of("requestId", event.requestId()), "/tasks");
                pushService.sendToUser(UUID.fromString(event.staffId()), title, body);
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
                String title = "Member Disputed Your Collection";
                String body  = memberDisplay + " rejected the partial collection." + reasonStr;
                inAppService.create(UUID.fromString(event.staffId()), title, body, "MEMBER_REJECTED_PARTIAL",
                    Map.of("requestId", event.requestId()), "/tasks");
                pushService.sendToUser(UUID.fromString(event.staffId()), title, body);
            }
        }
    }

    private void notifyAdminsAndManagers(String title, String message, String type,
                                          Map<String, String> metadata, String link) {
        List<String> adminIds = userServiceClient.getUserIdsByRole("ADMIN");
        List<String> managerIds = userServiceClient.getUserIdsByRole("MANAGER");

        for (String userId : adminIds) {
            inAppService.create(UUID.fromString(userId), title, message, type, metadata, link);
            pushService.sendToUser(UUID.fromString(userId), title, message);
        }
        for (String userId : managerIds) {
            inAppService.create(UUID.fromString(userId), title, message, type, metadata, link);
            pushService.sendToUser(UUID.fromString(userId), title, message);
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
