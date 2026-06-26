package com.chitfund.paymentservice.service;

import com.chitfund.common.exception.BusinessException;
import com.chitfund.common.exception.ErrorCode;
import com.chitfund.common.exception.ResourceNotFoundException;
import com.chitfund.paymentservice.domain.CashPaymentRequest;
import com.chitfund.paymentservice.domain.enums.CashRequestStatus;
import com.chitfund.paymentservice.domain.enums.NotificationType;
import com.chitfund.paymentservice.dto.request.AssignWorkerRequest;
import com.chitfund.paymentservice.dto.request.CollectCashRequest;
import com.chitfund.paymentservice.dto.request.CreateCashRequestRequest;
import com.chitfund.paymentservice.dto.response.CashRequestResponse;
import com.chitfund.paymentservice.dto.response.PaymentBatchResponse;
import com.chitfund.paymentservice.repository.CashPaymentRequestRepository;
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
    private final PaymentService paymentService;
    private final NotificationService notificationService;

    /**
     * Member submits a cash pickup request.
     * The memberId comes from the JWT — members can only create requests for themselves.
     */
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

        // Notify member: their request was received
        notificationService.notifyUser(memberId, NotificationType.CASH_REQUEST_SUBMITTED,
                "Cash Pickup Requested",
                "Your cash pickup request has been submitted and is awaiting assignment to a worker.",
                "CASH_REQUEST", saved.getId(), "/payments");
        // Notify ADMIN and MANAGER: a new pending cash request needs attention
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

    /**
     * Admin/Manager: all PENDING requests waiting to be assigned.
     */
    public List<CashRequestResponse> getPendingRequests() {
        return requestRepository
                .findByStatusOrderByRequestedAtAsc(CashRequestStatus.PENDING)
                .stream().map(this::toResponse).toList();
    }

    /**
     * Admin/Manager: all active requests (PENDING + ASSIGNED + PICKED_UP) for the dashboard.
     */
    public List<CashRequestResponse> getActiveRequests() {
        return requestRepository
                .findByStatusInOrderByRequestedAtAsc(
                        List.of(CashRequestStatus.PENDING, CashRequestStatus.ASSIGNED, CashRequestStatus.PICKED_UP))
                .stream().map(this::toResponse).toList();
    }

    /**
     * Admin/Manager creates a cash pickup request on behalf of a member, optionally assigning a worker immediately.
     */
    @Transactional
    public CashRequestResponse createRequestByAdmin(UUID memberId, UUID workerId, CreateCashRequestRequest dto, UUID adminId) {
        CashPaymentRequest req = CashPaymentRequest.builder()
                .memberId(memberId)
                .chitId(dto.getChitId())
                .requestedAmount(dto.getRequestedAmount())
                .status(workerId != null ? CashRequestStatus.ASSIGNED : CashRequestStatus.PENDING)
                .notes(dto.getNotes())
                .assignedWorkerId(workerId)
                .assignedAt(workerId != null ? LocalDateTime.now() : null)
                .assignedBy(workerId != null ? adminId : null)
                .build();
        CashPaymentRequest saved = requestRepository.save(req);

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

    /**
     * Admin/Manager assigns a worker to a PENDING request.
     */
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

        // Notify the assigned worker: they have a new cash pickup task
        notificationService.notifyUser(dto.getWorkerId(), NotificationType.CASH_REQUEST_ASSIGNED,
                "New Cash Pickup Task",
                "You have been assigned to collect cash from a member. Check your tasks.",
                "CASH_REQUEST", requestId, "/tasks");
        // Notify the member: their request has been assigned
        notificationService.notifyUser(req.getMemberId(), NotificationType.CASH_REQUEST_ASSIGNED,
                "Worker Assigned",
                "A worker has been assigned to your cash pickup request and will contact you shortly.",
                "CASH_REQUEST", requestId, "/member");
        // Cross-notify: if admin assigned → notify managers; if manager assigned → notify admin
        if ("ADMIN".equals(assignerRole)) {
            notificationService.notifyRole("MANAGER", NotificationType.CASH_REQUEST_ASSIGNED,
                    "Cash Request Assigned",
                    "Admin assigned a worker to a cash pickup request.",
                    "CASH_REQUEST", requestId, "/payments");
        } else {
            notificationService.notifyRole("ADMIN", NotificationType.CASH_REQUEST_ASSIGNED,
                    "Cash Request Assigned",
                    "Manager assigned a worker to a cash pickup request.",
                    "CASH_REQUEST", requestId, "/payments");
        }

        return toResponse(saved);
    }

    /**
     * Worker: all requests assigned to them that are not yet collected (ASSIGNED + PICKED_UP).
     */
    public List<CashRequestResponse> getMyAssignedRequests(UUID workerId) {
        return requestRepository
                .findByAssignedWorkerIdAndStatusInOrderByAssignedAtAsc(
                        workerId, List.of(CashRequestStatus.ASSIGNED, CashRequestStatus.PICKED_UP))
                .stream().map(this::toResponse).toList();
    }

    /**
     * Worker: their own past requests — COLLECTED and CANCELLED (newest first).
     */
    public List<CashRequestResponse> getMyRequestHistory(UUID workerId) {
        return requestRepository
                .findByAssignedWorkerIdAndStatusInOrderByUpdatedAtDesc(
                        workerId, List.of(CashRequestStatus.COLLECTED, CashRequestStatus.CANCELLED))
                .stream().map(this::toResponse).toList();
    }

    /**
     * Admin/Manager: full request history for a specific worker (all statuses).
     */
    public List<CashRequestResponse> getWorkerRequests(UUID workerId) {
        return requestRepository
                .findByAssignedWorkerIdOrderByRequestedAtDesc(workerId)
                .stream().map(this::toResponse).toList();
    }

    /**
     * Member: their own request history.
     */
    public List<CashRequestResponse> getMyRequests(UUID memberId) {
        return requestRepository
                .findByMemberIdOrderByRequestedAtDesc(memberId)
                .stream().map(this::toResponse).toList();
    }

    /**
     * Worker: marks that they have physically picked up the cash from the member.
     * ASSIGNED → PICKED_UP. This is the proof step: if the worker doesn't click this,
     * the member's portal still shows "Assigned" — so neither side can dispute.
     */
    @Transactional
    public CashRequestResponse markPickedUp(UUID requestId, UUID workerId) {
        CashPaymentRequest req = findOrThrow(requestId);

        if (req.getStatus() != CashRequestStatus.ASSIGNED) {
            throw new BusinessException(ErrorCode.INVALID_STATUS_TRANSITION,
                    "Request is not in ASSIGNED state — current status: " + req.getStatus());
        }
        if (!req.getAssignedWorkerId().equals(workerId)) {
            throw new BusinessException(ErrorCode.FORBIDDEN,
                    "This request is not assigned to you");
        }

        req.setStatus(CashRequestStatus.PICKED_UP);
        req.setPickedUpAt(LocalDateTime.now());
        req.setPickedUpBy(workerId);
        CashPaymentRequest saved = requestRepository.save(req);

        // Notify member: their cash was physically picked up — they see proof of pickup
        notificationService.notifyUser(req.getMemberId(), NotificationType.CASH_REQUEST_ASSIGNED,
                "Cash Picked Up",
                "A worker has picked up your cash payment and is handing it to admin. You'll be notified once it's confirmed.",
                "CASH_REQUEST", requestId, "/member");
        // Notify admin/manager: ready to collect from worker
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
     * Admin/Manager: confirms they received the cash from the worker.
     * PICKED_UP → COLLECTED. Creates the payment batch to credit the member's account.
     * Previously this was a worker action; now it's an admin confirmation step.
     */
    @Transactional
    public PaymentBatchResponse collectForRequest(UUID requestId, UUID adminId) {
        CashPaymentRequest req = findOrThrow(requestId);

        if (req.getStatus() != CashRequestStatus.PICKED_UP) {
            throw new BusinessException(ErrorCode.INVALID_STATUS_TRANSITION,
                    "Request must be in PICKED_UP state before admin can confirm collection — current status: " + req.getStatus());
        }

        // PaymentService.collectCash() requires a non-null amount
        if (req.getRequestedAmount() == null) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    "No amount specified on this request — amount must be set before confirming");
        }

        CollectCashRequest collectReq = new CollectCashRequest();
        collectReq.setChitId(req.getChitId());
        collectReq.setMemberId(req.getMemberId());
        collectReq.setAmount(req.getRequestedAmount());
        collectReq.setNotes("Collected via request #" + requestId);

        // Admin already physically holds the cash — complete immediately (no remittance step needed)
        PaymentBatchResponse batch = paymentService.collectCash(collectReq, req.getAssignedWorkerId(), true);

        req.setStatus(CashRequestStatus.COLLECTED);
        req.setCollectedBatchId(batch.getId());
        requestRepository.save(req);

        // Notify member: payment officially confirmed and credited
        notificationService.notifyUser(req.getMemberId(), NotificationType.CASH_COLLECTED,
                "Payment Confirmed",
                "Admin has confirmed receipt of your cash payment. Your account has been credited.",
                "CASH_REQUEST", requestId, "/member");
        // Notify the worker: their collection is complete
        if (req.getAssignedWorkerId() != null) {
            notificationService.notifyUser(req.getAssignedWorkerId(), NotificationType.CASH_COLLECTED,
                    "Collection Confirmed",
                    "Admin confirmed your cash handover. Task complete.",
                    "CASH_REQUEST", requestId, "/tasks");
        }

        return batch;
    }

    /**
     * Worker: reschedule a ASSIGNED request to a future date.
     * Status stays ASSIGNED — only the scheduledFor date changes.
     * Admin is notified so they know the worker deferred.
     */
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

        // Notify admin/manager so they see the deferral
        notificationService.notifyRole("ADMIN", NotificationType.CASH_REQUEST_ASSIGNED,
                "Pickup Rescheduled",
                "A worker rescheduled a cash pickup to " + scheduledFor.toLocalDate() + ".",
                "CASH_REQUEST", requestId, "/payments");
        notificationService.notifyRole("MANAGER", NotificationType.CASH_REQUEST_ASSIGNED,
                "Pickup Rescheduled",
                "A worker rescheduled a cash pickup to " + scheduledFor.toLocalDate() + ".",
                "CASH_REQUEST", requestId, "/payments");

        return toResponse(saved);
    }

    /**
     * Worker: cancel their own ASSIGNED request (e.g., member not reachable).
     * Only allowed while status is ASSIGNED (before physical pickup).
     */
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

        // Notify admin/manager so they can reassign if needed
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

    /**
     * Admin/Manager: cancel a PENDING, ASSIGNED, or PICKED_UP request.
     */
    @Transactional
    public CashRequestResponse cancelRequest(UUID requestId, String reason) {
        CashPaymentRequest req = findOrThrow(requestId);
        if (req.getStatus() == CashRequestStatus.COLLECTED) {
            throw new BusinessException(ErrorCode.INVALID_STATUS_TRANSITION,
                    "Cannot cancel a request that has already been collected");
        }
        req.setStatus(CashRequestStatus.CANCELLED);
        if (reason != null) req.setAdminNotes(reason);
        return toResponse(requestRepository.save(req));
    }

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
}
