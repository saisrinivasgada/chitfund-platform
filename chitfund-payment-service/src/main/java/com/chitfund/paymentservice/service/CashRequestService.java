package com.chitfund.paymentservice.service;

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
import com.chitfund.paymentservice.dto.response.CashRequestAuditLogResponse;
import com.chitfund.paymentservice.dto.response.CashRequestResponse;
import com.chitfund.paymentservice.dto.response.PaymentBatchResponse;
import com.chitfund.paymentservice.repository.CashPaymentRequestRepository;
import com.chitfund.paymentservice.repository.CashRequestAuditLogRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
@Transactional(readOnly = true)
public class CashRequestService {

    private final CashPaymentRequestRepository requestRepository;
    private final CashRequestAuditLogRepository auditLogRepository;
    private final PaymentService paymentService;
    private final NotificationService notificationService;

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
        CashPaymentRequest req = CashPaymentRequest.builder()
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
                "Your cash pickup request has been submitted and is awaiting assignment to a worker.",
                "CASH_REQUEST", saved.getId(), "/payments");
        notificationService.notifyRole("ADMIN", NotificationType.CASH_REQUEST_SUBMITTED,
                "New Cash Pickup Request",
                "A member has requested a cash pickup. Review and assign a worker.",
                "CASH_REQUEST", saved.getId(), "/payments");
        notificationService.notifyRole("MANAGER", NotificationType.CASH_REQUEST_SUBMITTED,
                "New Cash Pickup Request",
                "A member has requested a cash pickup. Review and assign a worker.",
                "CASH_REQUEST", saved.getId(), "/payments");

        return toResponse(saved);
    }

    public List<CashRequestResponse> getPendingRequests() {
        return requestRepository
                .findByStatusOrderByRequestedAtAsc(CashRequestStatus.PENDING)
                .stream().map(this::toResponse).toList();
    }

    public List<CashRequestResponse> getActiveRequests() {
        return requestRepository
                .findByStatusInOrderByRequestedAtAsc(
                        List.of(CashRequestStatus.PENDING, CashRequestStatus.ASSIGNED, CashRequestStatus.PICKED_UP))
                .stream().map(this::toResponse).toList();
    }

    @Transactional
    public CashRequestResponse createRequestByAdmin(UUID memberId, UUID workerId, CreateCashRequestRequest dto, UUID adminId) {
        CashRequestStatus initialStatus = workerId != null ? CashRequestStatus.ASSIGNED : CashRequestStatus.PENDING;
        CashPaymentRequest req = CashPaymentRequest.builder()
                .memberId(memberId)
                .chitId(dto.getChitId())
                .requestedAmount(dto.getRequestedAmount())
                .status(initialStatus)
                .notes(dto.getNotes())
                .assignedWorkerId(workerId)
                .assignedAt(workerId != null ? LocalDateTime.now() : null)
                .assignedBy(workerId != null ? adminId : null)
                .build();
        CashPaymentRequest saved = requestRepository.save(req);

        logAudit(saved.getId(), "CREATED", null, initialStatus, adminId, "ADMIN", "Created by admin");
        if (workerId != null) {
            logAudit(saved.getId(), "ASSIGNED", CashRequestStatus.PENDING, CashRequestStatus.ASSIGNED, adminId, "ADMIN", null);
        }

        if (workerId != null) {
            notificationService.notifyUser(workerId, NotificationType.CASH_REQUEST_ASSIGNED,
                    "New Cash Pickup Task",
                    "You have been assigned to collect cash from a member. Check your tasks.",
                    "CASH_REQUEST", saved.getId(), "/tasks");
        }
        notificationService.notifyUser(memberId, NotificationType.CASH_REQUEST_SUBMITTED,
                "Cash Pickup Scheduled",
                workerId != null
                        ? "A worker has been assigned to collect your payment. They will contact you shortly."
                        : "A cash pickup has been scheduled for you. A worker will be assigned soon.",
                "CASH_REQUEST", saved.getId(), "/member");

        return toResponse(saved);
    }

    @Transactional
    public CashRequestResponse assignWorker(UUID requestId, AssignWorkerRequest dto, UUID assignerId, String assignerRole) {
        CashPaymentRequest req = findOrThrow(requestId);
        if (req.getStatus() != CashRequestStatus.PENDING) {
            throw new BusinessException(ErrorCode.INVALID_STATUS_TRANSITION,
                    "Request is already " + req.getStatus() + " — cannot reassign");
        }
        req.setAssignedWorkerId(dto.getWorkerId());
        req.setAssignedAt(LocalDateTime.now());
        req.setAssignedBy(assignerId);
        req.setStatus(CashRequestStatus.ASSIGNED);
        if (dto.getAdminNotes() != null) req.setAdminNotes(dto.getAdminNotes());
        CashPaymentRequest saved = requestRepository.save(req);

        logAudit(requestId, "ASSIGNED", CashRequestStatus.PENDING, CashRequestStatus.ASSIGNED, assignerId, assignerRole, dto.getAdminNotes());

        notificationService.notifyUser(dto.getWorkerId(), NotificationType.CASH_REQUEST_ASSIGNED,
                "New Cash Pickup Task",
                "You have been assigned to collect cash from a member. Check your tasks.",
                "CASH_REQUEST", requestId, "/tasks");
        notificationService.notifyUser(req.getMemberId(), NotificationType.CASH_REQUEST_ASSIGNED,
                "Worker Assigned",
                "A worker has been assigned to your cash pickup request and will contact you shortly.",
                "CASH_REQUEST", requestId, "/member");
        if ("ADMIN".equals(assignerRole)) {
            notificationService.notifyRole("MANAGER", NotificationType.CASH_REQUEST_ASSIGNED,
                    "Cash Request Assigned", "Admin assigned a worker to a cash pickup request.",
                    "CASH_REQUEST", requestId, "/payments");
        } else {
            notificationService.notifyRole("ADMIN", NotificationType.CASH_REQUEST_ASSIGNED,
                    "Cash Request Assigned", "Manager assigned a worker to a cash pickup request.",
                    "CASH_REQUEST", requestId, "/payments");
        }

        return toResponse(saved);
    }

    public List<CashRequestResponse> getMyAssignedRequests(UUID workerId) {
        return requestRepository
                .findByAssignedWorkerIdAndStatusInOrderByAssignedAtAsc(
                        workerId, List.of(CashRequestStatus.ASSIGNED, CashRequestStatus.PICKED_UP))
                .stream().map(this::toResponse).toList();
    }

    public List<CashRequestResponse> getMyRequestHistory(UUID workerId) {
        return requestRepository
                .findByAssignedWorkerIdAndStatusInOrderByUpdatedAtDesc(
                        workerId, List.of(CashRequestStatus.COLLECTED, CashRequestStatus.CANCELLED))
                .stream().map(this::toResponse).toList();
    }

    public List<CashRequestResponse> getWorkerRequests(UUID workerId) {
        return requestRepository
                .findByAssignedWorkerIdOrderByRequestedAtDesc(workerId)
                .stream().map(this::toResponse).toList();
    }

    public List<CashRequestResponse> getMyRequests(UUID memberId) {
        return requestRepository
                .findByMemberIdOrderByRequestedAtDesc(memberId)
                .stream().map(this::toResponse).toList();
    }

    @Transactional
    public CashRequestResponse markPickedUp(UUID requestId, UUID workerId) {
        CashPaymentRequest req = findOrThrow(requestId);

        if (req.getStatus() != CashRequestStatus.ASSIGNED) {
            throw new BusinessException(ErrorCode.INVALID_STATUS_TRANSITION,
                    "Request is not in ASSIGNED state — current status: " + req.getStatus());
        }
        if (!req.getAssignedWorkerId().equals(workerId)) {
            throw new BusinessException(ErrorCode.FORBIDDEN, "This request is not assigned to you");
        }

        req.setStatus(CashRequestStatus.PICKED_UP);
        req.setPickedUpAt(LocalDateTime.now());
        req.setPickedUpBy(workerId);
        CashPaymentRequest saved = requestRepository.save(req);

        logAudit(requestId, "PICKED_UP", CashRequestStatus.ASSIGNED, CashRequestStatus.PICKED_UP, workerId, "WORKER", null);

        notificationService.notifyUser(req.getMemberId(), NotificationType.CASH_REQUEST_ASSIGNED,
                "Cash Picked Up",
                "A worker has picked up your cash payment and is handing it to admin. You'll be notified once it's confirmed.",
                "CASH_REQUEST", requestId, "/member");
        notificationService.notifyRole("ADMIN", NotificationType.CASH_COLLECTED,
                "Cash Picked Up — Ready to Collect",
                "A worker has picked up cash from a member. Please confirm receipt to credit the member's account.",
                "CASH_REQUEST", requestId, "/payments");
        notificationService.notifyRole("MANAGER", NotificationType.CASH_COLLECTED,
                "Cash Picked Up — Ready to Collect",
                "A worker has picked up cash from a member. Please confirm receipt to credit the member's account.",
                "CASH_REQUEST", requestId, "/payments");

        return toResponse(saved);
    }

    /**
     * Admin: voids a PICKED_UP — reverts to ASSIGNED (worker still owns it, pickup mark erased).
     * Use when a worker accidentally clicked PICKED_UP for the wrong member.
     */
    @Transactional
    public CashRequestResponse voidPickup(UUID requestId, UUID adminId, String adminRole, String reason) {
        CashPaymentRequest req = findOrThrow(requestId);

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

        // Notify worker: their pickup was voided, they still own the task
        if (req.getAssignedWorkerId() != null) {
            notificationService.notifyUser(req.getAssignedWorkerId(), NotificationType.CASH_REQUEST_ASSIGNED,
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
        CashPaymentRequest req = findOrThrow(requestId);

        if (req.getStatus() != CashRequestStatus.PICKED_UP) {
            throw new BusinessException(ErrorCode.INVALID_STATUS_TRANSITION,
                    "Request must be in PICKED_UP state before admin can confirm collection — current status: " + req.getStatus());
        }
        if (req.getRequestedAmount() == null) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    "No amount specified on this request — amount must be set before confirming");
        }

        CollectCashRequest collectReq = new CollectCashRequest();
        collectReq.setChitId(req.getChitId());
        collectReq.setMemberId(req.getMemberId());
        collectReq.setAmount(req.getRequestedAmount());
        collectReq.setNotes("Collected via request #" + requestId);

        PaymentBatchResponse batch = paymentService.collectCash(collectReq, req.getAssignedWorkerId(), true);

        req.setStatus(CashRequestStatus.COLLECTED);
        req.setCollectedBatchId(batch.getId());
        requestRepository.save(req);

        logAudit(requestId, "COLLECTED", CashRequestStatus.PICKED_UP, CashRequestStatus.COLLECTED, adminId, "ADMIN", null);

        notificationService.notifyUser(req.getMemberId(), NotificationType.CASH_COLLECTED,
                "Payment Confirmed",
                "Admin has confirmed receipt of your cash payment. Your account has been credited.",
                "CASH_REQUEST", requestId, "/member");
        if (req.getAssignedWorkerId() != null) {
            notificationService.notifyUser(req.getAssignedWorkerId(), NotificationType.CASH_COLLECTED,
                    "Collection Confirmed",
                    "Admin confirmed your cash handover. Task complete.",
                    "CASH_REQUEST", requestId, "/tasks");
        }

        return batch;
    }

    @Transactional
    public CashRequestResponse rescheduleRequest(UUID requestId, UUID workerId, LocalDateTime scheduledFor) {
        CashPaymentRequest req = findOrThrow(requestId);

        if (req.getStatus() != CashRequestStatus.ASSIGNED) {
            throw new BusinessException(ErrorCode.INVALID_STATUS_TRANSITION,
                    "Only ASSIGNED requests can be rescheduled — current status: " + req.getStatus());
        }
        if (!req.getAssignedWorkerId().equals(workerId)) {
            throw new BusinessException(ErrorCode.FORBIDDEN, "This request is not assigned to you");
        }

        req.setScheduledFor(scheduledFor);
        CashPaymentRequest saved = requestRepository.save(req);

        logAudit(requestId, "RESCHEDULED", CashRequestStatus.ASSIGNED, CashRequestStatus.ASSIGNED,
                workerId, "WORKER", "Rescheduled to " + scheduledFor.toLocalDate());

        notificationService.notifyRole("ADMIN", NotificationType.CASH_REQUEST_ASSIGNED,
                "Pickup Rescheduled", "A worker rescheduled a cash pickup to " + scheduledFor.toLocalDate() + ".",
                "CASH_REQUEST", requestId, "/payments");
        notificationService.notifyRole("MANAGER", NotificationType.CASH_REQUEST_ASSIGNED,
                "Pickup Rescheduled", "A worker rescheduled a cash pickup to " + scheduledFor.toLocalDate() + ".",
                "CASH_REQUEST", requestId, "/payments");

        return toResponse(saved);
    }

    @Transactional
    public CashRequestResponse cancelByWorker(UUID requestId, UUID workerId, String reason) {
        CashPaymentRequest req = findOrThrow(requestId);

        if (req.getStatus() != CashRequestStatus.ASSIGNED) {
            throw new BusinessException(ErrorCode.INVALID_STATUS_TRANSITION,
                    "Only ASSIGNED requests can be cancelled by worker — current status: " + req.getStatus());
        }
        if (!req.getAssignedWorkerId().equals(workerId)) {
            throw new BusinessException(ErrorCode.FORBIDDEN, "This request is not assigned to you");
        }

        req.setStatus(CashRequestStatus.CANCELLED);
        if (reason != null) req.setAdminNotes("Cancelled by worker: " + reason);
        CashPaymentRequest saved = requestRepository.save(req);

        logAudit(requestId, "CANCELLED", CashRequestStatus.ASSIGNED, CashRequestStatus.CANCELLED,
                workerId, "WORKER", reason != null ? "Cancelled by worker: " + reason : null);

        notificationService.notifyRole("ADMIN", NotificationType.CASH_REQUEST_SUBMITTED,
                "Pickup Cancelled by Worker",
                "A worker cancelled a cash pickup task. The request may need to be reassigned.",
                "CASH_REQUEST", requestId, "/payments");
        notificationService.notifyRole("MANAGER", NotificationType.CASH_REQUEST_SUBMITTED,
                "Pickup Cancelled by Worker",
                "A worker cancelled a cash pickup task. The request may need to be reassigned.",
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

    private CashRequestResponse toResponse(CashPaymentRequest r) {
        return CashRequestResponse.builder()
                .id(r.getId())
                .memberId(r.getMemberId())
                .chitId(r.getChitId())
                .requestedAmount(r.getRequestedAmount())
                .status(r.getStatus())
                .assignedWorkerId(r.getAssignedWorkerId())
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
}
