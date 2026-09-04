package com.chitfund.paymentservice.service;

import com.chitfund.common.context.TenantContext;
import com.chitfund.common.event.CashRequestEvent;
import com.chitfund.common.exception.BusinessException;
import com.chitfund.common.exception.ErrorCode;
import com.chitfund.common.exception.ResourceNotFoundException;
import com.chitfund.paymentservice.domain.CashPaymentRequest;
import com.chitfund.paymentservice.domain.CashRequestAuditLog;
import com.chitfund.paymentservice.domain.enums.CashRequestStatus;
import com.chitfund.paymentservice.domain.enums.NotificationType;
import com.chitfund.paymentservice.dto.request.AssignWorkerRequest;
import com.chitfund.paymentservice.dto.request.CollectCashRequest;
import com.chitfund.paymentservice.dto.request.CreateCashRequestRequest;
import com.chitfund.paymentservice.dto.request.UpdateCashRequestRequest;
import com.chitfund.paymentservice.dto.response.CashRequestAuditLogResponse;
import com.chitfund.paymentservice.dto.response.CashRequestResponse;
import com.chitfund.paymentservice.dto.response.CashRequestSummaryResponse;
import com.chitfund.paymentservice.dto.response.PaymentBatchResponse;
import com.chitfund.paymentservice.client.MemberServiceClient;
import com.chitfund.paymentservice.client.UserServiceClient;
import com.chitfund.paymentservice.kafka.PaymentEventPublisher;
import com.chitfund.paymentservice.repository.CashPaymentRequestRepository;
import com.chitfund.paymentservice.repository.CashRequestAuditLogRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

@Service
@RequiredArgsConstructor
@Slf4j
@Transactional(readOnly = true)
public class CashRequestService {

    private final CashPaymentRequestRepository requestRepository;
    private final CashRequestAuditLogRepository auditLogRepository;
    private final PaymentService paymentService;
    private final NotificationService notificationService;
    private final MemberServiceClient memberServiceClient;
    private final UserServiceClient userServiceClient;
    private final PaymentEventPublisher eventPublisher;
    private final PlanExpiryChecker planExpiryChecker;

    private String tenantId() {
        String tid = TenantContext.get();
        return tid != null ? tid : "10000000-0000-0000-0000-000000000001";
    }

    // ─── Audit helper ────────────────────────────────────────────────────────

    private void logAudit(UUID requestId, String action,
                          CashRequestStatus from, CashRequestStatus to,
                          UUID performedBy, String performedByRole, String reason) {
        auditLogRepository.save(CashRequestAuditLog.builder()
                .requestId(requestId)
                .action(action)
                .fromStatus(from != null ? from.name() : null)
                .toStatus(to.name())
                .performedBy(performedBy)
                .performedByRole(performedByRole)
                .reason(reason)
                .build());
    }

    // ─── Public API ──────────────────────────────────────────────────────────

    @Transactional
    public CashRequestResponse createRequest(UUID memberId, CreateCashRequestRequest dto) {
        planExpiryChecker.assertNotExpired();
        CashPaymentRequest req = CashPaymentRequest.builder()
                .tenantId(tenantId())
                .memberId(memberId)
                .chitId(dto.getChitId())
                .requestedAmount(dto.getRequestedAmount())
                .status(CashRequestStatus.PENDING)
                .notes(dto.getNotes())
                .build();
        CashPaymentRequest saved = requestRepository.save(req);

        logAudit(saved.getId(), "CREATED", null, CashRequestStatus.PENDING, memberId, "MEMBER", null);

        notificationService.notifyUser(memberId, NotificationType.CASH_REQUEST_SUBMITTED,
                "Cash Pickup Requested",
                "Your cash pickup request has been submitted and is awaiting assignment to a staff member.",
                "CASH_REQUEST", saved.getId(), "/payments");
        notificationService.notifyRole("ADMIN", NotificationType.CASH_REQUEST_SUBMITTED,
                "New Cash Pickup Request",
                "A member has requested a cash pickup. Review and assign a staff member.",
                "CASH_REQUEST", saved.getId(), "/payments");
        notificationService.notifyRole("MANAGER", NotificationType.CASH_REQUEST_SUBMITTED,
                "New Cash Pickup Request",
                "A member has requested a cash pickup. Review and assign a staff member.",
                "CASH_REQUEST", saved.getId(), "/payments");

        publishCashRequestEvent("CREATED", saved, memberServiceClient.getMemberName(memberId), null);

        return toResponse(saved);
    }

    public List<CashRequestResponse> getPendingRequests() {
        return requestRepository
                .findByTenantIdAndStatusOrderByRequestedAtAsc(tenantId(), CashRequestStatus.PENDING)
                .stream().map(this::toResponse).toList();
    }

    public List<CashRequestResponse> getActiveRequests() {
        return requestRepository
                .findByTenantIdAndStatusInOrderByRequestedAtAsc(
                        tenantId(),
                        List.of(CashRequestStatus.PENDING, CashRequestStatus.SCHEDULED,
                                CashRequestStatus.ASSIGNED, CashRequestStatus.PICKED_UP,
                                CashRequestStatus.PARTIALLY_COLLECTED))
                .stream().map(this::toResponse).toList();
    }

    @Transactional
    public CashRequestResponse createRequestByAdmin(UUID memberProfileId, UUID staffId, CreateCashRequestRequest dto, UUID adminId, String assigneeRole) {
        planExpiryChecker.assertNotExpired();
        // memberProfileId is the member-service UUID (from admin dropdown).
        // We must store the user-service UUID as memberId so the member can find
        // this request via /my-requests (which queries by JWT principal = user-service UUID).
        String resolvedUserIdStr = memberServiceClient.getMemberUserId(memberProfileId);
        UUID memberId = resolvedUserIdStr != null ? UUID.fromString(resolvedUserIdStr) : memberProfileId;

        CashRequestStatus initialStatus = staffId != null ? CashRequestStatus.ASSIGNED
                : dto.getScheduledFor() != null ? CashRequestStatus.SCHEDULED
                : CashRequestStatus.PENDING;
        CashPaymentRequest req = CashPaymentRequest.builder()
                .tenantId(tenantId())
                .memberId(memberId)
                .chitId(dto.getChitId())
                .requestedAmount(dto.getRequestedAmount())
                .status(initialStatus)
                .notes(dto.getNotes())
                .assignedStaffId(staffId)
                .assignedAt(staffId != null ? LocalDateTime.now() : null)
                .assignedBy(staffId != null ? adminId : null)
                .scheduledFor(dto.getScheduledFor())
                .build();
        CashPaymentRequest saved = requestRepository.save(req);

        logAudit(saved.getId(), "CREATED", null, initialStatus, adminId, "ADMIN", "Created by admin");
        if (staffId != null) {
            logAudit(saved.getId(), "ASSIGNED", null, CashRequestStatus.ASSIGNED, adminId, "ADMIN", "Assigned at creation");
        }

        String memberName = memberServiceClient.getMemberName(memberProfileId);
        if (staffId != null) {
            String memberDisplay = memberName.isBlank() ? "a member" : memberName;
            String assigneeLink = "MANAGER".equals(assigneeRole) ? "/pickups" : "/tasks";
            notificationService.notifyUser(staffId, NotificationType.CASH_REQUEST_ASSIGNED,
                    "New Cash Pickup Task",
                    "You have been assigned to collect cash from " + memberDisplay + ". Check your tasks.",
                    "CASH_REQUEST", saved.getId(), assigneeLink);
        }
        String staffName = staffId != null ? userServiceClient.getUserName(staffId) : "";
        String staffDisplay = staffName.isBlank() ? "a staff member" : staffName;
        notificationService.notifyUser(memberId, NotificationType.CASH_REQUEST_SUBMITTED,
                "Cash Pickup Scheduled",
                staffId != null
                        ? staffDisplay + " has been assigned to collect your payment and will contact you shortly."
                        : "A cash pickup has been scheduled for you. A staff member will be assigned soon.",
                "CASH_REQUEST", saved.getId(), "/member");

        publishCashRequestEvent(staffId != null ? "ASSIGNED" : "CREATED", saved, memberName, staffName);

        return toResponse(saved);
    }

    @Transactional
    public CashRequestResponse assignStaff(UUID requestId, AssignWorkerRequest dto, UUID assignerId, String assignerRole) {
        planExpiryChecker.assertNotExpired();
        CashPaymentRequest req = findOrThrow(requestId);
        if (req.getStatus() != CashRequestStatus.PENDING && req.getStatus() != CashRequestStatus.SCHEDULED) {
            throw new BusinessException(ErrorCode.INVALID_STATUS_TRANSITION,
                    "Request is already " + req.getStatus() + " — cannot reassign");
        }
        CashRequestStatus prevStatus = req.getStatus();
        req.setAssignedStaffId(dto.getStaffId());
        req.setAssignedAt(LocalDateTime.now());
        req.setAssignedBy(assignerId);
        req.setStatus(CashRequestStatus.ASSIGNED);
        if (dto.getAdminNotes() != null) req.setAdminNotes(dto.getAdminNotes());
        CashPaymentRequest saved = requestRepository.save(req);

        logAudit(requestId, "ASSIGNED", prevStatus, CashRequestStatus.ASSIGNED, assignerId, assignerRole, dto.getAdminNotes());

        String memberName = memberServiceClient.getMemberName(req.getMemberId());
        String memberDisplay = memberName.isBlank() ? "a member" : memberName;
        String staffName = userServiceClient.getUserName(dto.getStaffId());
        String staffDisplay = staffName.isBlank() ? "a staff member" : staffName;

        String assigneeNotifLink = "MANAGER".equals(dto.getAssigneeRole()) ? "/pickups" : "/tasks";
        notificationService.notifyUser(dto.getStaffId(), NotificationType.CASH_REQUEST_ASSIGNED,
                "New Cash Pickup Task",
                "You have been assigned to collect cash from " + memberDisplay + ". Check your tasks.",
                "CASH_REQUEST", requestId, assigneeNotifLink);
        notificationService.notifyUser(req.getMemberId(), NotificationType.CASH_REQUEST_ASSIGNED,
                "Staff Assigned",
                staffDisplay + " has been assigned to your cash pickup request and will contact you shortly.",
                "CASH_REQUEST", requestId, "/member");
        if ("ADMIN".equals(assignerRole)) {
            notificationService.notifyRole("MANAGER", NotificationType.CASH_REQUEST_ASSIGNED,
                    "Cash Request Assigned", "Admin assigned a staff member to a cash pickup request.",
                    "CASH_REQUEST", requestId, "/payments");
        } else {
            notificationService.notifyRole("ADMIN", NotificationType.CASH_REQUEST_ASSIGNED,
                    "Cash Request Assigned", "Manager assigned a staff member to a cash pickup request.",
                    "CASH_REQUEST", requestId, "/payments");
        }

        publishCashRequestEvent("ASSIGNED", saved, memberName, staffName);

        return toResponse(saved);
    }

    public List<CashRequestResponse> getMyAssignedRequests(UUID staffId) {
        return requestRepository
                .findByTenantIdAndAssignedStaffIdAndStatusInOrderByAssignedAtAsc(
                        tenantId(), staffId,
                        List.of(CashRequestStatus.ASSIGNED, CashRequestStatus.PICKED_UP,
                                CashRequestStatus.PARTIALLY_COLLECTED))
                .stream().map(this::toResponse).toList();
    }

    public List<CashRequestResponse> getMyRequestHistory(UUID staffId) {
        return requestRepository
                .findByTenantIdAndAssignedStaffIdAndStatusInOrderByUpdatedAtDesc(
                        tenantId(), staffId,
                        List.of(CashRequestStatus.COLLECTED, CashRequestStatus.CANCELLED))
                .stream().map(this::toResponse).toList();
    }

    public List<CashRequestResponse> getStaffRequests(UUID staffId) {
        return requestRepository
                .findByTenantIdAndAssignedStaffIdOrderByRequestedAtDesc(tenantId(), staffId)
                .stream().map(this::toResponse).toList();
    }

    public List<CashRequestResponse> getMyRequests(UUID memberId) {
        return requestRepository
                .findByTenantIdAndMemberIdOrderByRequestedAtDesc(tenantId(), memberId)
                .stream().map(this::toResponse).toList();
    }

    @Transactional
    public CashRequestResponse markPickedUp(UUID requestId, UUID collectorId, String role) {
        CashPaymentRequest req = findOrThrowForWrite(requestId);

        if (req.getStatus() != CashRequestStatus.ASSIGNED) {
            throw new BusinessException(ErrorCode.INVALID_STATUS_TRANSITION,
                    "Request is not in ASSIGNED state — current status: " + req.getStatus());
        }
        if (!req.getAssignedStaffId().equals(collectorId)) {
            throw new BusinessException(ErrorCode.FORBIDDEN, "This request is not assigned to you");
        }

        req.setStatus(CashRequestStatus.PICKED_UP);
        req.setPickedUpAt(LocalDateTime.now());
        req.setPickedUpBy(collectorId);
        CashPaymentRequest saved = requestRepository.save(req);

        logAudit(requestId, "PICKED_UP", CashRequestStatus.ASSIGNED, CashRequestStatus.PICKED_UP, collectorId, role, null);

        String sName = userServiceClient.getUserName(collectorId);
        String sDisplay = sName.isBlank() ? "A staff member" : sName;
        notificationService.notifyUser(req.getMemberId(), NotificationType.CASH_REQUEST_ASSIGNED,
                "Cash Picked Up",
                sDisplay + " has picked up your cash payment and is handing it to admin. You'll be notified once it's confirmed.",
                "CASH_REQUEST", requestId, "/member");
        notificationService.notifyRole("ADMIN", NotificationType.CASH_COLLECTED,
                "Cash Picked Up — Ready to Collect",
                "Cash has been picked up from a member. Please confirm receipt to credit the member's account.",
                "CASH_REQUEST", requestId, "/payments");
        if (!"MANAGER".equals(role)) {
            notificationService.notifyRole("MANAGER", NotificationType.CASH_COLLECTED,
                    "Cash Picked Up — Ready to Collect",
                    "A staff member has picked up cash from a member. Please confirm receipt to credit the member's account.",
                    "CASH_REQUEST", requestId, "/payments");
        }

        String memberName = memberServiceClient.getMemberName(req.getMemberId());
        publishCashRequestEvent("PICKED_UP", saved, memberName, sName);

        return toResponse(saved);
    }

    /**
     * Admin: voids a PICKED_UP — reverts to ASSIGNED (worker still owns it, pickup mark erased).
     * Use when a worker accidentally clicked PICKED_UP for the wrong member.
     */
    @Transactional
    public CashRequestResponse voidPickup(UUID requestId, UUID adminId, String adminRole, String reason) {
        CashPaymentRequest req = findOrThrowForWrite(requestId);

        if (req.getStatus() != CashRequestStatus.PICKED_UP) {
            throw new BusinessException(ErrorCode.INVALID_STATUS_TRANSITION,
                    "Only PICKED_UP requests can have their pickup voided — current status: " + req.getStatus());
        }

        req.setStatus(CashRequestStatus.ASSIGNED);
        req.setPickedUpAt(null);
        req.setPickedUpBy(null);
        if (reason != null && !reason.isBlank()) {
            req.setAdminNotes(reason);
        }
        CashPaymentRequest saved = requestRepository.save(req);

        logAudit(requestId, "PICKUP_VOIDED", CashRequestStatus.PICKED_UP, CashRequestStatus.ASSIGNED,
                adminId, adminRole, reason);

        // Notify staff: their pickup was voided, they still own the task
        if (req.getAssignedStaffId() != null) {
            notificationService.notifyUser(req.getAssignedStaffId(), NotificationType.CASH_REQUEST_ASSIGNED,
                    "Pickup Voided by Admin",
                    "Admin has voided your cash pickup record. Please re-visit the member to collect and mark pickup again.",
                    "CASH_REQUEST", requestId, "/tasks");
        }
        // Notify member
        notificationService.notifyUser(req.getMemberId(), NotificationType.CASH_REQUEST_ASSIGNED,
                "Pickup Record Corrected",
                "The worker will revisit you shortly to collect payment.",
                "CASH_REQUEST", requestId, "/member");

        log.info("Admin {} voided pickup on request {} — reason: {}", adminId, requestId, reason);
        return toResponse(saved);
    }

    @Transactional
    public PaymentBatchResponse collectForRequest(UUID requestId, UUID adminId) {
        CashPaymentRequest req = findOrThrowForWrite(requestId);

        if (req.getStatus() != CashRequestStatus.PICKED_UP
                && req.getStatus() != CashRequestStatus.PARTIALLY_COLLECTED) {
            throw new BusinessException(ErrorCode.INVALID_STATUS_TRANSITION,
                    "Request must be in PICKED_UP or PARTIALLY_COLLECTED state before admin can confirm collection — current status: " + req.getStatus());
        }

        BigDecimal amountToCredit = req.getCollectedAmount() != null
                ? req.getCollectedAmount()
                : req.getRequestedAmount();

        if (amountToCredit == null) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    "No amount specified on this request — amount must be set before confirming");
        }

        CashRequestStatus prevStatus = req.getStatus();

        // CashPaymentRequest.memberId stores the user-service UUID, but payment records
        // are keyed by member-service profile UUID. Resolve the profile UUID here so
        // applyFifo can find the correct outstanding records for this draw.
        UUID paymentMemberId = memberServiceClient.getProfileIdByUserId(req.getMemberId());
        if (paymentMemberId == null) {
            // memberId may already be a profile UUID (e.g. if member-service lookup failed at
            // request creation and the raw profile UUID was stored), so fall back to it.
            paymentMemberId = req.getMemberId();
        }

        CollectCashRequest collectReq = new CollectCashRequest();
        collectReq.setChitId(req.getChitId());
        collectReq.setMemberId(paymentMemberId);
        collectReq.setAmount(amountToCredit);
        collectReq.setNotes("Collected via request #" + requestId
                + (prevStatus == CashRequestStatus.PARTIALLY_COLLECTED ? " (partial)" : ""));

        PaymentBatchResponse batch = paymentService.collectCash(collectReq, req.getAssignedStaffId(), true, null, true);

        req.setStatus(CashRequestStatus.COLLECTED);
        req.setCollectedBatchId(batch.getId());
        requestRepository.save(req);

        logAudit(requestId, "COLLECTED", prevStatus, CashRequestStatus.COLLECTED, adminId, "ADMIN",
                prevStatus == CashRequestStatus.PARTIALLY_COLLECTED
                        ? "Partial amount of ₹" + amountToCredit.toPlainString() + " credited" : null);

        notificationService.notifyUser(req.getMemberId(), NotificationType.CASH_COLLECTED,
                "Payment Confirmed",
                "Admin has confirmed receipt of your cash payment. Your account has been credited.",
                "CASH_REQUEST", requestId, "/member");
        if (req.getAssignedStaffId() != null) {
            notificationService.notifyUser(req.getAssignedStaffId(), NotificationType.CASH_COLLECTED,
                    "Collection Confirmed",
                    "Admin confirmed your cash handover. Task complete.",
                    "CASH_REQUEST", requestId, "/tasks");
        }

        String mName = memberServiceClient.getMemberName(req.getMemberId());
        String sName = req.getAssignedStaffId() != null
                ? userServiceClient.getUserName(req.getAssignedStaffId()) : null;
        publishCashRequestEvent("COLLECTED", req, mName, sName);

        return batch;
    }

    @Transactional
    public CashRequestResponse partiallyCollect(UUID requestId, BigDecimal collectedAmount, UUID collectorId, String role) {
        CashPaymentRequest req = findOrThrowForWrite(requestId);

        if (req.getStatus() != CashRequestStatus.ASSIGNED) {
            throw new BusinessException(ErrorCode.INVALID_STATUS_TRANSITION,
                    "Request must be ASSIGNED to mark partial collection — current status: " + req.getStatus());
        }
        if (!req.getAssignedStaffId().equals(collectorId)) {
            throw new BusinessException(ErrorCode.FORBIDDEN, "This request is not assigned to you");
        }
        if (req.getRequestedAmount() != null && collectedAmount.compareTo(req.getRequestedAmount()) >= 0) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    "Collected amount must be less than requested amount — use regular pickup for full collection");
        }

        req.setStatus(CashRequestStatus.PARTIALLY_COLLECTED);
        req.setCollectedAmount(collectedAmount);
        req.setPartiallyCollectedAt(LocalDateTime.now());
        req.setPickedUpAt(LocalDateTime.now());
        req.setPickedUpBy(collectorId);
        CashPaymentRequest saved = requestRepository.save(req);

        logAudit(requestId, "PARTIALLY_COLLECTED", CashRequestStatus.ASSIGNED,
                CashRequestStatus.PARTIALLY_COLLECTED, collectorId, role,
                "Collected ₹" + collectedAmount.toPlainString()
                        + (req.getRequestedAmount() != null ? " of ₹" + req.getRequestedAmount().toPlainString() : ""));

        String sName = userServiceClient.getUserName(collectorId);
        String sDisplay = sName.isBlank() ? "A staff member" : sName;
        String requestedStr = req.getRequestedAmount() != null ? req.getRequestedAmount().toPlainString() : "requested";
        BigDecimal remaining = req.getRequestedAmount() != null
                ? req.getRequestedAmount().subtract(collectedAmount) : null;

        notificationService.notifyUser(req.getMemberId(), NotificationType.CASH_REQUEST_ASSIGNED,
                "Partial Cash Pickup — Approval Needed",
                sDisplay + " collected ₹" + collectedAmount.toPlainString()
                        + " of your ₹" + requestedStr
                        + " request. Please approve or reject this partial collection on your account page.",
                "CASH_REQUEST", requestId, "/member");
        notificationService.notifyRole("ADMIN", NotificationType.CASH_COLLECTED,
                "Partial Cash Pickup Recorded",
                sDisplay + " collected ₹" + collectedAmount.toPlainString()
                        + " of ₹" + requestedStr
                        + (remaining != null ? " (₹" + remaining.toPlainString() + " remaining)" : "")
                        + ". Awaiting member approval.",
                "CASH_REQUEST", requestId, "/payments");
        if (!"MANAGER".equals(role)) {
            notificationService.notifyRole("MANAGER", NotificationType.CASH_COLLECTED,
                    "Partial Cash Pickup Recorded",
                    sDisplay + " collected ₹" + collectedAmount.toPlainString()
                            + " of ₹" + requestedStr
                            + (remaining != null ? " (₹" + remaining.toPlainString() + " remaining)" : "")
                            + ". Awaiting member approval.",
                    "CASH_REQUEST", requestId, "/payments");
        }

        String mName = memberServiceClient.getMemberName(req.getMemberId());
        publishCashRequestEvent("PARTIALLY_COLLECTED", saved, mName, sName, collectedAmount, null);

        return toResponse(saved);
    }

    @Transactional
    public CashRequestResponse memberApprovePartial(UUID requestId, boolean approved, String reason, UUID memberId) {
        CashPaymentRequest req = findOrThrowForWrite(requestId);

        if (req.getStatus() != CashRequestStatus.PARTIALLY_COLLECTED) {
            throw new BusinessException(ErrorCode.INVALID_STATUS_TRANSITION,
                    "Only PARTIALLY_COLLECTED requests can be approved/rejected by member");
        }
        if (!req.getMemberId().equals(memberId)) {
            throw new BusinessException(ErrorCode.FORBIDDEN, "This request does not belong to you");
        }

        req.setMemberApproved(approved);
        if (!approved && reason != null) {
            req.setMemberRejectionReason(reason);
        }
        CashPaymentRequest saved = requestRepository.save(req);

        logAudit(requestId, approved ? "MEMBER_APPROVED" : "MEMBER_REJECTED",
                CashRequestStatus.PARTIALLY_COLLECTED, CashRequestStatus.PARTIALLY_COLLECTED,
                memberId, "MEMBER", approved ? null : reason);

        notificationService.notifyRole("ADMIN", NotificationType.CASH_REQUEST_ASSIGNED,
                approved ? "Member Approved Partial Collection" : "Member Rejected Partial Collection",
                approved
                        ? "Member confirmed that ₹" + req.getCollectedAmount().toPlainString() + " was collected. Proceed to remit."
                        : "Member disputed the partial collection. Reason: " + (reason != null ? reason : "—") + ". Review and edit amount if needed.",
                "CASH_REQUEST", requestId, "/payments");
        notificationService.notifyRole("MANAGER", NotificationType.CASH_REQUEST_ASSIGNED,
                approved ? "Member Approved Partial Collection" : "Member Rejected Partial Collection",
                approved
                        ? "Member confirmed that ₹" + req.getCollectedAmount().toPlainString() + " was collected. Proceed to remit."
                        : "Member disputed the partial collection. Reason: " + (reason != null ? reason : "—") + ". Review and edit amount if needed.",
                "CASH_REQUEST", requestId, "/payments");

        if (req.getAssignedStaffId() != null) {
            notificationService.notifyUser(req.getAssignedStaffId(), NotificationType.CASH_REQUEST_ASSIGNED,
                    approved ? "Member Approved Your Collection" : "Member Disputed Your Collection",
                    approved
                            ? "The member confirmed the ₹" + req.getCollectedAmount().toPlainString() + " partial collection. Admin will remit soon."
                            : "The member disputed the partial collection. Admin will review. Reason: " + (reason != null ? reason : "—"),
                    "CASH_REQUEST", requestId, "/tasks");
        }

        String mName = memberServiceClient.getMemberName(req.getMemberId());
        String sName = req.getAssignedStaffId() != null ? userServiceClient.getUserName(req.getAssignedStaffId()) : "";
        publishCashRequestEvent(
                approved ? "MEMBER_APPROVED" : "MEMBER_REJECTED",
                saved, mName, sName,
                req.getCollectedAmount(),
                approved ? null : reason
        );

        return toResponse(saved);
    }

    public CashRequestSummaryResponse getSummary() {
        String tid = tenantId();
        LocalDateTime todayStart = LocalDate.now().atStartOfDay();
        return CashRequestSummaryResponse.builder()
                .pending(requestRepository.countByTenantIdAndStatus(tid, CashRequestStatus.PENDING))
                .assigned(requestRepository.countByTenantIdAndStatus(tid, CashRequestStatus.ASSIGNED))
                .pickedUp(requestRepository.countByTenantIdAndStatus(tid, CashRequestStatus.PICKED_UP))
                .partiallyCollected(requestRepository.countByTenantIdAndStatus(tid, CashRequestStatus.PARTIALLY_COLLECTED))
                .cancelled(requestRepository.countByTenantIdAndStatus(tid, CashRequestStatus.CANCELLED))
                .collected(requestRepository.countByTenantIdAndStatus(tid, CashRequestStatus.COLLECTED))
                .todayCancelled(requestRepository.countByTenantIdAndStatusAndUpdatedAtAfter(tid, CashRequestStatus.CANCELLED, todayStart))
                .todayCollected(requestRepository.countByTenantIdAndStatusAndUpdatedAtAfter(tid, CashRequestStatus.COLLECTED, todayStart))
                .todayRequested(requestRepository.countByTenantIdAndRequestedAtAfter(tid, todayStart))
                .build();
    }

    public List<CashRequestResponse> getCancelledRequests() {
        return requestRepository
                .findByTenantIdAndStatusOrderByUpdatedAtDesc(tenantId(), CashRequestStatus.CANCELLED)
                .stream().map(this::toResponse).toList();
    }

    @Transactional
    public CashRequestResponse rescheduleRequest(UUID requestId, UUID staffId, LocalDateTime scheduledFor) {
        planExpiryChecker.assertNotExpired();
        CashPaymentRequest req = findOrThrow(requestId);

        if (req.getStatus() != CashRequestStatus.ASSIGNED) {
            throw new BusinessException(ErrorCode.INVALID_STATUS_TRANSITION,
                    "Only ASSIGNED requests can be rescheduled — current status: " + req.getStatus());
        }
        if (!req.getAssignedStaffId().equals(staffId)) {
            throw new BusinessException(ErrorCode.FORBIDDEN, "This request is not assigned to you");
        }

        req.setScheduledFor(scheduledFor);
        CashPaymentRequest saved = requestRepository.save(req);

        logAudit(requestId, "RESCHEDULED", CashRequestStatus.ASSIGNED, CashRequestStatus.ASSIGNED,
                staffId, "STAFF", "Rescheduled to " + scheduledFor.toLocalDate());

        notificationService.notifyRole("ADMIN", NotificationType.CASH_REQUEST_ASSIGNED,
                "Pickup Rescheduled", "A staff member rescheduled a cash pickup to " + scheduledFor.toLocalDate() + ".",
                "CASH_REQUEST", requestId, "/payments");
        notificationService.notifyRole("MANAGER", NotificationType.CASH_REQUEST_ASSIGNED,
                "Pickup Rescheduled", "A staff member rescheduled a cash pickup to " + scheduledFor.toLocalDate() + ".",
                "CASH_REQUEST", requestId, "/payments");

        return toResponse(saved);
    }

    @Transactional
    public CashRequestResponse cancelByStaff(UUID requestId, UUID staffId, String reason) {
        CashPaymentRequest req = findOrThrow(requestId);

        if (req.getStatus() != CashRequestStatus.ASSIGNED) {
            throw new BusinessException(ErrorCode.INVALID_STATUS_TRANSITION,
                    "Only ASSIGNED requests can be cancelled by staff — current status: " + req.getStatus());
        }
        if (!req.getAssignedStaffId().equals(staffId)) {
            throw new BusinessException(ErrorCode.FORBIDDEN, "This request is not assigned to you");
        }

        req.setStatus(CashRequestStatus.CANCELLED);
        if (reason != null) req.setAdminNotes("Cancelled by staff: " + reason);
        CashPaymentRequest saved = requestRepository.save(req);

        logAudit(requestId, "CANCELLED", CashRequestStatus.ASSIGNED, CashRequestStatus.CANCELLED,
                staffId, "STAFF", reason != null ? "Cancelled by staff: " + reason : null);

        notificationService.notifyRole("ADMIN", NotificationType.CASH_REQUEST_SUBMITTED,
                "Pickup Cancelled by Staff",
                "A staff member cancelled a cash pickup task. The request may need to be reassigned.",
                "CASH_REQUEST", requestId, "/payments");
        notificationService.notifyRole("MANAGER", NotificationType.CASH_REQUEST_SUBMITTED,
                "Pickup Cancelled by Staff",
                "A staff member cancelled a cash pickup task. The request may need to be reassigned.",
                "CASH_REQUEST", requestId, "/payments");

        return toResponse(saved);
    }

    @Transactional
    public CashRequestResponse cancelRequest(UUID requestId, String reason) {
        CashPaymentRequest req = findOrThrow(requestId);
        if (req.getStatus() == CashRequestStatus.COLLECTED) {
            throw new BusinessException(ErrorCode.INVALID_STATUS_TRANSITION,
                    "Cannot cancel a request that has already been collected");
        }
        CashRequestStatus from = req.getStatus();
        req.setStatus(CashRequestStatus.CANCELLED);
        if (reason != null) req.setAdminNotes(reason);
        CashPaymentRequest saved = requestRepository.save(req);

        logAudit(requestId, "CANCELLED", from, CashRequestStatus.CANCELLED, null, "ADMIN", reason);

        return toResponse(saved);
    }

    @Transactional
    public CashRequestResponse updateRequest(UUID requestId, UpdateCashRequestRequest dto, UUID adminId, String adminRole) {
        CashPaymentRequest req = findOrThrow(requestId);

        if (req.getStatus() == CashRequestStatus.PICKED_UP
                || req.getStatus() == CashRequestStatus.COLLECTED
                || req.getStatus() == CashRequestStatus.CANCELLED) {
            throw new BusinessException(ErrorCode.INVALID_STATUS_TRANSITION,
                    "Cannot edit a request in " + req.getStatus() + " state");
        }

        UUID oldStaffId = req.getAssignedStaffId();
        boolean amountChanged = dto.getRequestedAmount() != null
                && !dto.getRequestedAmount().equals(req.getRequestedAmount());
        boolean staffChanged = Boolean.TRUE.equals(dto.getUpdateStaff())
                && !java.util.Objects.equals(oldStaffId, dto.getStaffId());

        if (dto.getRequestedAmount() != null) req.setRequestedAmount(dto.getRequestedAmount());
        if (dto.getAdminNotes() != null) req.setAdminNotes(dto.getAdminNotes());
        if (dto.getScheduledFor() != null) req.setScheduledFor(dto.getScheduledFor());

        if (staffChanged) {
            UUID newStaffId = dto.getStaffId();
            req.setAssignedStaffId(newStaffId);
            if (newStaffId != null) {
                req.setAssignedAt(LocalDateTime.now());
                req.setAssignedBy(adminId);
                req.setStatus(CashRequestStatus.ASSIGNED);
            } else {
                req.setAssignedAt(null);
                req.setAssignedBy(null);
                req.setStatus(CashRequestStatus.PENDING);
            }
        }

        CashPaymentRequest saved = requestRepository.save(req);

        StringBuilder auditReason = new StringBuilder("Admin updated");
        if (amountChanged) auditReason.append("; amount changed to ").append(dto.getRequestedAmount());
        if (staffChanged) auditReason.append("; staff changed");
        logAudit(requestId, "UPDATED", req.getStatus(), saved.getStatus(), adminId, adminRole, auditReason.toString());

        // Notify member and staff of changes
        if (amountChanged || staffChanged) {
            String memberName = memberServiceClient.getMemberName(req.getMemberId());
            String memberDisplay = memberName.isBlank() ? "your" : memberName + "'s";

            if (amountChanged) {
                String amtStr = "₹" + dto.getRequestedAmount().toPlainString();
                notificationService.notifyUser(req.getMemberId(), NotificationType.CASH_REQUEST_ASSIGNED,
                        "Cash Pickup Updated",
                        "The amount for your cash pickup has been updated to " + amtStr + ".",
                        "CASH_REQUEST", requestId, "/member");
                if (saved.getAssignedStaffId() != null) {
                    notificationService.notifyUser(saved.getAssignedStaffId(), NotificationType.CASH_REQUEST_ASSIGNED,
                            "Pickup Amount Updated",
                            "The amount for " + memberDisplay + " cash pickup has been updated to " + amtStr + ". Please collect the revised amount.",
                            "CASH_REQUEST", requestId, "/tasks");
                }
            }

            if (staffChanged) {
                // Notify old staff they've been removed
                if (oldStaffId != null) {
                    notificationService.notifyUser(oldStaffId, NotificationType.CASH_REQUEST_ASSIGNED,
                            "Task Reassigned",
                            "The cash pickup for " + memberDisplay + " has been reassigned to another staff member.",
                            "CASH_REQUEST", requestId, "/tasks");
                }
                // Notify new staff
                if (saved.getAssignedStaffId() != null) {
                    String sName = userServiceClient.getUserName(saved.getAssignedStaffId());
                    notificationService.notifyUser(saved.getAssignedStaffId(), NotificationType.CASH_REQUEST_ASSIGNED,
                            "New Cash Pickup Task",
                            "You have been assigned to collect cash from " + (memberName.isBlank() ? "a member" : memberName) + ". Check your tasks.",
                            "CASH_REQUEST", requestId, "/tasks");
                    String staffDisplay = sName.isBlank() ? "A new staff member" : sName;
                    notificationService.notifyUser(req.getMemberId(), NotificationType.CASH_REQUEST_ASSIGNED,
                            "Staff Updated",
                            staffDisplay + " has been assigned to collect your cash payment.",
                            "CASH_REQUEST", requestId, "/member");
                } else {
                    // Staff was removed (back to pending)
                    notificationService.notifyUser(req.getMemberId(), NotificationType.CASH_REQUEST_ASSIGNED,
                            "Pickup Pending",
                            "Your cash pickup is awaiting reassignment. You'll be notified once a staff member is assigned.",
                            "CASH_REQUEST", requestId, "/member");
                }
            }
        }

        return toResponse(saved);
    }

    public List<CashRequestAuditLogResponse> getAuditLog(UUID requestId) {
        findOrThrow(requestId); // validates request exists
        return auditLogRepository.findByRequestIdOrderByPerformedAtAsc(requestId)
                .stream().map(this::toAuditResponse).toList();
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    private CashPaymentRequest findOrThrow(UUID id) {
        return requestRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("CashPaymentRequest", id));
    }

    /** Use inside @Transactional write methods — acquires a row-level lock to prevent concurrent state transitions. */
    private CashPaymentRequest findOrThrowForWrite(UUID id) {
        return requestRepository.findByIdAndTenantIdForUpdate(id, TenantContext.get())
                .orElseThrow(() -> new ResourceNotFoundException("CashPaymentRequest", id));
    }

    /** Publishes a Kafka event only after the surrounding DB transaction commits, preventing phantom events on rollback. */
    private void publishAfterCommit(Runnable publish) {
        if (TransactionSynchronizationManager.isActualTransactionActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override public void afterCommit() {
                    try { publish.run(); }
                    catch (Exception e) { log.error("Post-commit event publish failed: {}", e.getMessage()); }
                }
            });
        } else {
            publish.run();
        }
    }

    private CashRequestResponse toResponse(CashPaymentRequest r) {
        return CashRequestResponse.builder()
                .id(r.getId())
                .memberId(r.getMemberId())
                .chitId(r.getChitId())
                .requestedAmount(r.getRequestedAmount())
                .collectedAmount(r.getCollectedAmount())
                .memberApproved(r.getMemberApproved())
                .memberRejectionReason(r.getMemberRejectionReason())
                .partiallyCollectedAt(r.getPartiallyCollectedAt())
                .parentRequestId(r.getParentRequestId())
                .status(r.getStatus())
                .assignedStaffId(r.getAssignedStaffId())
                .assignedAt(r.getAssignedAt())
                .assignedBy(r.getAssignedBy())
                .pickedUpAt(r.getPickedUpAt())
                .pickedUpBy(r.getPickedUpBy())
                .scheduledFor(r.getScheduledFor())
                .notes(r.getNotes())
                .adminNotes(r.getAdminNotes())
                .collectedBatchId(r.getCollectedBatchId())
                .requestedAt(r.getRequestedAt())
                .updatedAt(r.getUpdatedAt())
                .build();
    }

    private CashRequestAuditLogResponse toAuditResponse(CashRequestAuditLog log) {
        return CashRequestAuditLogResponse.builder()
                .id(log.getId())
                .requestId(log.getRequestId())
                .action(log.getAction())
                .fromStatus(log.getFromStatus())
                .toStatus(log.getToStatus())
                .performedBy(log.getPerformedBy())
                .performedByRole(log.getPerformedByRole())
                .reason(log.getReason())
                .performedAt(log.getPerformedAt())
                .build();
    }

    private void publishCashRequestEvent(String eventType, CashPaymentRequest req,
                                          String memberName, String staffName) {
        publishCashRequestEvent(eventType, req, memberName, staffName, null, null);
    }

    private void publishCashRequestEvent(String eventType, CashPaymentRequest req,
                                          String memberName, String staffName,
                                          BigDecimal collectedAmount, String extraData) {
        try {
            // memberId in the entity is always the user-service UUID (either self-created JWT principal,
            // or resolved from member-service UUID in createRequestByAdmin).
            // getMemberUserId() returns null when passed a user-service UUID (correct — it's already a userId).
            // In that case fall back to memberId itself as the userId so the event always has a memberUserId.
            String memberUserId = memberServiceClient.getMemberUserId(req.getMemberId());
            if (memberUserId == null) memberUserId = req.getMemberId().toString();
            String tenantId = com.chitfund.common.context.TenantContext.get();
            CashRequestEvent event = new CashRequestEvent(
                    tenantId,
                    req.getId().toString(), eventType,
                    req.getMemberId().toString(), memberUserId,
                    req.getAssignedStaffId() != null ? req.getAssignedStaffId().toString() : null,
                    req.getRequestedAmount(), memberName, staffName,
                    Instant.now(), collectedAmount, extraData);
            publishAfterCommit(() -> eventPublisher.publish(event));
        } catch (Exception e) {
            log.warn("Failed to build cash request event {}: {}", eventType, e.getMessage());
        }
    }
}
