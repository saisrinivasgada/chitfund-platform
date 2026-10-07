package com.chitfund.paymentservice.service;

import com.chitfund.common.context.TenantContext;
import com.chitfund.common.event.PaymentIntimationNotificationEvent;
import com.chitfund.common.exception.BusinessException;
import com.chitfund.common.exception.ErrorCode;
import com.chitfund.paymentservice.domain.PaymentIntimation;
import com.chitfund.paymentservice.domain.PaymentIntimationItem;
import com.chitfund.paymentservice.domain.enums.IntimationStatus;
import com.chitfund.paymentservice.domain.enums.PaymentMode;
import com.chitfund.paymentservice.dto.request.ApproveIntimationRequest;
import com.chitfund.paymentservice.dto.request.CreateIntimationRequest;
import com.chitfund.paymentservice.dto.request.RecordPaymentRequest;
import com.chitfund.paymentservice.dto.request.RequestedChitAllocation;
import com.chitfund.paymentservice.dto.request.VoidPaymentRequest;
import com.chitfund.paymentservice.dto.response.IntimationItemResponse;
import com.chitfund.paymentservice.dto.response.IntimationResponse;
import com.chitfund.paymentservice.dto.response.PaymentBatchResponse;
import com.chitfund.paymentservice.domain.PaymentIntimationAuditLog;
import com.chitfund.paymentservice.dto.response.PaymentIntimationAuditLogResponse;
import com.chitfund.paymentservice.kafka.PaymentEventPublisher;
import com.chitfund.paymentservice.repository.PaymentIntimationAuditLogRepository;
import com.chitfund.paymentservice.repository.PaymentIntimationRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
@Transactional(readOnly = true)
public class PaymentIntimationService {

    private final PaymentIntimationRepository intimationRepository;
    private final PaymentIntimationAuditLogRepository auditLogRepository;
    private final PaymentService paymentService;
    private final PaymentEventPublisher eventPublisher;

    private String tenantId() {
        String tid = TenantContext.get();
        if (tid == null || tid.isBlank()) {
            throw new BusinessException(ErrorCode.UNAUTHORIZED,
                    "Your session does not identify an organisation. Please sign in again.",
                    HttpStatus.UNAUTHORIZED);
        }
        return tid;
    }

    @Transactional
    public IntimationResponse createIntimation(UUID memberId, CreateIntimationRequest request) {
        String tid = tenantId();
        validatePaymentDetails(request.getPaymentMode(), request.getPaymentReference());
        String paymentReference = normalizeReference(request.getPaymentReference());
        Set<UUID> distinctChits = request.getItems().stream()
                .map(CreateIntimationRequest.IntimationItemRequest::getChitId)
                .collect(Collectors.toSet());
        if (distinctChits.size() != request.getItems().size()) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    "Each chit may appear only once in a payment intimation");
        }

        PaymentIntimation intimation = PaymentIntimation.builder()
                .tenantId(tid)
                .memberId(memberId.toString())
                .status(IntimationStatus.PENDING)
                .paymentMode(request.getPaymentMode())
                .paymentReference(paymentReference)
                .notes(request.getNotes())
                .submittedBy(memberId.toString())
                .build();

        List<PaymentIntimationItem> items = request.getItems().stream()
                .map(it -> PaymentIntimationItem.builder()
                        .intimation(intimation)
                        .chitId(it.getChitId().toString())
                        .claimedAmount(it.getClaimedAmount())
                        .build())
                .collect(Collectors.toList());
        intimation.setItems(items);

        intimationRepository.save(intimation);

        logAudit(intimation.getId(), tid, "CREATED", null, IntimationStatus.PENDING,
                memberId.toString(), "MEMBER", null);

        BigDecimal total = request.getItems().stream()
                .map(CreateIntimationRequest.IntimationItemRequest::getClaimedAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        eventPublisher.publish(new PaymentIntimationNotificationEvent(
                intimation.getId(), memberId.toString(), null, total,
                "SUBMITTED", null, tid));

        log.info("Intimation {} created by member {}", intimation.getId(), memberId);
        return toResponse(intimation);
    }

    @Transactional
    public IntimationResponse withdrawIntimation(String intimationId, UUID memberId) {
        PaymentIntimation intimation = findOwnedForUpdate(intimationId, memberId.toString());
        if (intimation.getStatus() == IntimationStatus.WITHDRAWN) {
            return toResponse(intimation);
        }
        requireStatus(intimation, IntimationStatus.PENDING);
        intimation.setStatus(IntimationStatus.WITHDRAWN);
        intimationRepository.save(intimation);
        logAudit(intimationId, intimation.getTenantId(), "WITHDRAWN",
                IntimationStatus.PENDING, IntimationStatus.WITHDRAWN,
                memberId.toString(), "MEMBER", null);
        return toResponse(intimation);
    }

    @Transactional
    public IntimationResponse approveIntimation(String intimationId, UUID adminId,
                                                ApproveIntimationRequest request) {
        String tid = tenantId();
        PaymentIntimation intimation = findByTenantForUpdate(intimationId, tid);

        Set<String> requestedItemIds = new HashSet<>();
        Map<String, BigDecimal> approvedAmounts = request.getItems().stream()
                .peek(item -> {
                    if (!requestedItemIds.add(item.getItemId())) {
                        throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                                "Each intimation item may appear only once in an approval");
                    }
                })
                .collect(Collectors.toMap(
                        ApproveIntimationRequest.ApprovedItemRequest::getItemId,
                        ApproveIntimationRequest.ApprovedItemRequest::getApprovedAmount));
        Set<String> storedItemIds = intimation.getItems().stream()
                .map(PaymentIntimationItem::getId)
                .collect(Collectors.toSet());
        if (!storedItemIds.equals(requestedItemIds)) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    "Approval must contain every intimation item exactly once");
        }
        if (intimation.getStatus() == IntimationStatus.APPROVED) {
            boolean sameApproval = intimation.getItems().stream().allMatch(item ->
                    item.getApprovedAmount() != null
                            && item.getApprovedAmount().compareTo(approvedAmounts.get(item.getId())) == 0
                            && item.getPaymentBatchId() != null);
            if (sameApproval) {
                return toResponse(intimation);
            }
            throw new BusinessException(ErrorCode.CONCURRENT_MODIFICATION,
                    "This intimation was already approved with different amounts", HttpStatus.CONFLICT);
        }
        requireStatus(intimation, IntimationStatus.PENDING);
        if (intimation.getPaymentMode() == null) {
            throw new BusinessException(ErrorCode.CONCURRENT_MODIFICATION,
                    "This legacy intimation has no payment method and cannot be approved safely. Ask the member to withdraw and resubmit it.",
                    HttpStatus.CONFLICT);
        }

        BigDecimal totalApproved = BigDecimal.ZERO;
        List<RequestedChitAllocation> allocations = new java.util.ArrayList<>();
        for (PaymentIntimationItem item : intimation.getItems()) {
            BigDecimal approved = approvedAmounts.get(item.getId());
            item.setApprovedAmount(approved);
            totalApproved = totalApproved.add(approved);
            RequestedChitAllocation allocation = new RequestedChitAllocation();
            allocation.setChitId(UUID.fromString(item.getChitId()));
            allocation.setAmount(approved);
            allocations.add(allocation);
        }

        RecordPaymentRequest payReq = new RecordPaymentRequest();
        payReq.setChitId(allocations.get(0).getChitId());
        payReq.setMemberId(UUID.fromString(intimation.getMemberId()));
        payReq.setAmount(totalApproved);
        payReq.setPaymentMode(intimation.getPaymentMode());
        payReq.setPaymentReference(intimation.getPaymentReference());
        payReq.setAllocations(allocations);
        payReq.setNotes("Payment intimation #" + intimation.getId().substring(0, 8));

        PaymentBatchResponse batch = paymentService.recordPayment(
                payReq, adminId, "INTIM:" + intimation.getId());
        for (PaymentIntimationItem item : intimation.getItems()) {
            item.setPaymentBatchId(batch.getId().toString());
        }

        intimation.setStatus(IntimationStatus.APPROVED);
        intimation.setApprovedBy(adminId.toString());
        intimation.setApprovedAt(LocalDateTime.now());
        intimationRepository.save(intimation);
        logAudit(intimationId, tid, "APPROVED",
                IntimationStatus.PENDING, IntimationStatus.APPROVED,
                adminId.toString(), "ADMIN", null);
        log.info("Intimation {} approved by admin {}", intimationId, adminId);
        return toResponse(intimation);
    }

    @Transactional
    public IntimationResponse rejectIntimation(String intimationId, UUID adminId, String reason) {
        reason = normalizeReason(reason);
        String tid = tenantId();
        PaymentIntimation intimation = findByTenantForUpdate(intimationId, tid);
        if (intimation.getStatus() == IntimationStatus.REJECTED
                && reason != null && reason.trim().equals(intimation.getRejectReason())) {
            return toResponse(intimation);
        }
        requireStatus(intimation, IntimationStatus.PENDING);

        intimation.setStatus(IntimationStatus.REJECTED);
        intimation.setRejectedBy(adminId.toString());
        intimation.setRejectedAt(LocalDateTime.now());
        intimation.setRejectReason(reason.trim());
        intimationRepository.save(intimation);
        logAudit(intimationId, tid, "REJECTED",
                IntimationStatus.PENDING, IntimationStatus.REJECTED,
                adminId.toString(), "ADMIN", reason.trim());

        BigDecimal total = intimation.getItems().stream()
                .map(PaymentIntimationItem::getClaimedAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        eventPublisher.publish(new PaymentIntimationNotificationEvent(
                intimationId, intimation.getMemberId(), null, total,
                "REJECTED", reason.trim(), tid));

        log.info("Intimation {} rejected by admin {}", intimationId, adminId);
        return toResponse(intimation);
    }

    @Transactional
    public IntimationResponse voidIntimation(String intimationId, UUID adminId, String reason) {
        reason = normalizeReason(reason);
        String tid = tenantId();
        PaymentIntimation intimation = findByTenantForUpdate(intimationId, tid);
        if (intimation.getStatus() == IntimationStatus.VOIDED) {
            return toResponse(intimation);
        }
        requireStatus(intimation, IntimationStatus.APPROVED);

        boolean hasMissingBatch = intimation.getItems().stream()
                .anyMatch(item -> item.getPaymentBatchId() == null);
        Set<String> paymentBatchIds = intimation.getItems().stream()
                .map(PaymentIntimationItem::getPaymentBatchId)
                .filter(java.util.Objects::nonNull)
                .collect(Collectors.toSet());
        if (hasMissingBatch || paymentBatchIds.isEmpty()) {
            throw new BusinessException(ErrorCode.CONCURRENT_MODIFICATION,
                    "The approved intimation is missing a linked payment batch and cannot be voided safely",
                    HttpStatus.CONFLICT);
        }
        for (String paymentBatchId : paymentBatchIds) {
            VoidPaymentRequest voidReq = new VoidPaymentRequest();
            voidReq.setReason("Voided via payment intimation: " + reason.trim());
            paymentService.voidPayment(UUID.fromString(paymentBatchId), voidReq, adminId);
        }

        intimation.setStatus(IntimationStatus.VOIDED);
        intimation.setVoidedBy(adminId.toString());
        intimation.setVoidedAt(LocalDateTime.now());
        intimation.setVoidReason(reason.trim());
        intimationRepository.save(intimation);
        logAudit(intimationId, tid, "VOIDED",
                IntimationStatus.APPROVED, IntimationStatus.VOIDED,
                adminId.toString(), "ADMIN", reason.trim());
        log.info("Intimation {} voided by admin {}", intimationId, adminId);
        return toResponse(intimation);
    }

    public List<IntimationResponse> getMyIntimations(UUID memberId) {
        return intimationRepository
                .findByTenantIdAndMemberIdOrderByCreatedAtDesc(tenantId(), memberId.toString())
                .stream().map(this::toResponse).collect(Collectors.toList());
    }

    public List<IntimationResponse> getPendingIntimations() {
        return intimationRepository
                .findByTenantIdAndStatusOrderByCreatedAtDesc(tenantId(), IntimationStatus.PENDING)
                .stream().map(this::toResponse).collect(Collectors.toList());
    }

    public List<IntimationResponse> getAllIntimations() {
        return intimationRepository
                .findByTenantIdOrderByCreatedAtDesc(tenantId())
                .stream().map(this::toResponse).collect(Collectors.toList());
    }

    public IntimationResponse getById(String intimationId) {
        return toResponse(findByTenant(intimationId, tenantId()));
    }

    public IntimationResponse getOwnedById(String intimationId, UUID memberId) {
        return toResponse(findOwned(intimationId, memberId.toString()));
    }

    public List<PaymentIntimationAuditLogResponse> getHistory(String intimationId) {
        String tid = tenantId();
        findByTenant(intimationId, tid);
        return auditLogRepository.findByTenantIdAndIntimationIdOrderByPerformedAtAsc(tid, intimationId)
                .stream().map(PaymentIntimationAuditLogResponse::from).collect(Collectors.toList());
    }

    public List<PaymentIntimationAuditLogResponse> getOwnedHistory(String intimationId, UUID memberId) {
        String tid = tenantId();
        findOwned(intimationId, memberId.toString());
        return auditLogRepository.findByTenantIdAndIntimationIdOrderByPerformedAtAsc(tid, intimationId)
                .stream().map(PaymentIntimationAuditLogResponse::from).collect(Collectors.toList());
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    private PaymentIntimation findByTenant(String id, String tid) {
        return intimationRepository.findByIdAndTenantId(id, tid)
                .orElseThrow(() -> new BusinessException(ErrorCode.INTIMATION_NOT_FOUND,
                        ErrorCode.INTIMATION_NOT_FOUND.getDefaultMessage()));
    }

    private PaymentIntimation findByTenantForUpdate(String id, String tid) {
        return intimationRepository.findByIdAndTenantIdForUpdate(id, tid)
                .orElseThrow(() -> new BusinessException(ErrorCode.INTIMATION_NOT_FOUND,
                        ErrorCode.INTIMATION_NOT_FOUND.getDefaultMessage()));
    }

    private PaymentIntimation findOwned(String id, String memberId) {
        PaymentIntimation intimation = findByTenant(id, tenantId());
        if (!memberId.equals(intimation.getMemberId())) {
            throw new BusinessException(ErrorCode.FORBIDDEN, "Access denied");
        }
        return intimation;
    }

    private PaymentIntimation findOwnedForUpdate(String id, String memberId) {
        PaymentIntimation intimation = findByTenantForUpdate(id, tenantId());
        if (!memberId.equals(intimation.getMemberId())) {
            throw new BusinessException(ErrorCode.FORBIDDEN, "Access denied");
        }
        return intimation;
    }

    private void requireStatus(PaymentIntimation intimation, IntimationStatus required) {
        if (intimation.getStatus() != required) {
            throw new BusinessException(ErrorCode.INTIMATION_INVALID_STATE,
                    "Expected status " + required + " but was " + intimation.getStatus());
        }
    }

    private String normalizeReason(String reason) {
        if (reason == null || reason.isBlank()) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED, "Reason is required");
        }
        String normalized = reason.trim();
        if (normalized.length() > 500) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    "Reason must not exceed 500 characters");
        }
        return normalized;
    }

    private void validatePaymentDetails(PaymentMode paymentMode, String reference) {
        if (paymentMode == null) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED, "Payment method is required");
        }
        if (paymentMode == PaymentMode.CREDIT) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    "A payment intimation must describe money the member actually paid");
        }
        if (paymentMode != PaymentMode.CASH && (reference == null || reference.isBlank())) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    "Payment reference is required for UPI, bank transfer and cheque payments");
        }
    }

    private String normalizeReference(String reference) {
        return reference == null || reference.isBlank() ? null : reference.trim();
    }

    private void logAudit(String intimationId, String tenantId, String action,
                          IntimationStatus from, IntimationStatus to,
                          String performedBy, String performedByRole, String reason) {
        auditLogRepository.save(PaymentIntimationAuditLog.builder()
                .tenantId(tenantId)
                .intimationId(intimationId)
                .action(action)
                .fromStatus(from != null ? from.name() : null)
                .toStatus(to.name())
                .performedBy(performedBy)
                .performedByRole(performedByRole)
                .reason(reason)
                .build());
    }

    private IntimationResponse toResponse(PaymentIntimation i) {
        List<IntimationItemResponse> items = i.getItems() == null ? List.of() :
                i.getItems().stream()
                        .map(it -> IntimationItemResponse.builder()
                                .id(it.getId())
                                .chitId(it.getChitId())
                                .claimedAmount(it.getClaimedAmount())
                                .approvedAmount(it.getApprovedAmount())
                                .paymentBatchId(it.getPaymentBatchId())
                                .build())
                        .collect(Collectors.toList());
        return IntimationResponse.builder()
                .id(i.getId())
                .memberId(i.getMemberId())
                .status(i.getStatus())
                .paymentMode(i.getPaymentMode())
                .paymentReference(i.getPaymentReference())
                .notes(i.getNotes())
                .rejectReason(i.getRejectReason())
                .voidReason(i.getVoidReason())
                .createdAt(i.getCreatedAt())
                .approvedAt(i.getApprovedAt())
                .rejectedAt(i.getRejectedAt())
                .voidedAt(i.getVoidedAt())
                .items(items)
                .build();
    }
}
