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
     * Admin/Manager: all active requests (PENDING + ASSIGNED) for the dashboard.
     */
    public List<CashRequestResponse> getActiveRequests() {
        return requestRepository
                .findByStatusInOrderByRequestedAtAsc(
                        List.of(CashRequestStatus.PENDING, CashRequestStatus.ASSIGNED))
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
     * Worker: all requests assigned to them (ASSIGNED status — not yet collected).
     */
    public List<CashRequestResponse> getMyAssignedRequests(UUID workerId) {
        return requestRepository
                .findByAssignedWorkerIdAndStatusOrderByAssignedAtAsc(workerId, CashRequestStatus.ASSIGNED)
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
     * Worker: collects cash for a specific request.
     * Delegates to PaymentService.collectCash() and links the resulting batch to the request.
     * The request must be ASSIGNED to this worker.
     */
    @Transactional
    public PaymentBatchResponse collectForRequest(UUID requestId, UUID workerId) {
        CashPaymentRequest req = findOrThrow(requestId);

        if (req.getStatus() != CashRequestStatus.ASSIGNED) {
            throw new BusinessException(ErrorCode.INVALID_STATUS_TRANSITION,
                    "Request is not in ASSIGNED state");
        }
        if (!req.getAssignedWorkerId().equals(workerId)) {
            throw new BusinessException(ErrorCode.FORBIDDEN,
                    "This request is not assigned to you");
        }

        // PaymentService.collectCash() requires a non-null amount
        if (req.getRequestedAmount() == null) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    "No amount specified on this request — member must enter an amount or admin must set one");
        }

        CollectCashRequest collectReq = new CollectCashRequest();
        collectReq.setChitId(req.getChitId());
        collectReq.setMemberId(req.getMemberId());
        collectReq.setAmount(req.getRequestedAmount());
        collectReq.setNotes("Collected via request #" + requestId);

        PaymentBatchResponse batch = paymentService.collectCash(collectReq, workerId);

        req.setStatus(CashRequestStatus.COLLECTED);
        req.setCollectedBatchId(batch.getId());
        requestRepository.save(req);

        // Notify member: their cash was picked up
        notificationService.notifyUser(req.getMemberId(), NotificationType.CASH_COLLECTED,
                "Cash Collected",
                "Your cash payment has been collected by the worker. It will be remitted to us shortly.",
                "CASH_REQUEST", requestId, "/member");
        notificationService.notifyRole("ADMIN", NotificationType.CASH_COLLECTED,
                "Cash Collected by Worker",
                "A worker has collected cash from a member. Awaiting remittance.",
                "CASH_REQUEST", requestId, "/payments");
        notificationService.notifyRole("MANAGER", NotificationType.CASH_COLLECTED,
                "Cash Collected by Worker",
                "A worker has collected cash from a member. Awaiting remittance.",
                "CASH_REQUEST", requestId, "/payments");

        return batch;
    }

    /**
     * Admin/Manager: cancel a PENDING or ASSIGNED request.
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
                .notes(r.getNotes())
                .adminNotes(r.getAdminNotes())
                .collectedBatchId(r.getCollectedBatchId())
                .requestedAt(r.getRequestedAt())
                .updatedAt(r.getUpdatedAt())
                .build();
    }
}
