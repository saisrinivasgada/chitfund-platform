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
import com.chitfund.paymentservice.dto.request.VoidPaymentRequest;
import com.chitfund.paymentservice.dto.response.IntimationItemResponse;
import com.chitfund.paymentservice.dto.response.IntimationResponse;
import com.chitfund.paymentservice.dto.response.PaymentBatchResponse;
import com.chitfund.paymentservice.domain.PaymentIntimationAuditLog;
import com.chitfund.paymentservice.dto.response.PaymentIntimationAuditLogResponse;
import com.chitfund.paymentservice.client.ChitServiceClient;
import com.chitfund.paymentservice.client.UserServiceClient;
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
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import java.time.Instant;

@Service
@RequiredArgsConstructor
@Slf4j
@Transactional(readOnly = true)
public class PaymentIntimationService {

    private final PaymentIntimationRepository intimationRepository;
    private final PaymentIntimationAuditLogRepository auditLogRepository;
    private final PaymentService paymentService;
    private final PaymentEventPublisher eventPublisher;
    private final UserServiceClient userServiceClient;
    private final ChitServiceClient chitServiceClient;

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

        PaymentIntimation intimation = PaymentIntimation.builder()
                .tenantId(tid)
                .memberId(memberId.toString())
                .status(IntimationStatus.PENDING)
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
        PaymentIntimation intimation = findOwned(intimationId, memberId.toString());
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
                                                ApproveIntimationRequest request, String actorRole) {
        String tid = tenantId();
        PaymentIntimation intimation = findByTenant(intimationId, tid);
        requireStatus(intimation, IntimationStatus.PENDING);

        Map<String, BigDecimal> approvedAmounts = request.getItems().stream()
                .collect(Collectors.toMap(
                        ApproveIntimationRequest.ApprovedItemRequest::getItemId,
                        ApproveIntimationRequest.ApprovedItemRequest::getApprovedAmount));

        for (PaymentIntimationItem item : intimation.getItems()) {
            BigDecimal approved = approvedAmounts.getOrDefault(item.getId(), item.getClaimedAmount());
            item.setApprovedAmount(approved);

            RecordPaymentRequest payReq = new RecordPaymentRequest();
            payReq.setChitId(UUID.fromString(item.getChitId()));
            payReq.setMemberId(UUID.fromString(intimation.getMemberId()));
            payReq.setAmount(approved);
            payReq.setPaymentMode(PaymentMode.CASH);
            payReq.setNotes("Payment intimation #" + intimation.getId().substring(0, 8));

            PaymentBatchResponse batch = paymentService.recordPayment(payReq, adminId,
                    UUID.randomUUID().toString());
            item.setPaymentBatchId(batch.getId().toString());
        }

        intimation.setStatus(IntimationStatus.APPROVED);
        intimation.setApprovedBy(adminId.toString());
        intimation.setApprovedAt(LocalDateTime.now());
        intimationRepository.save(intimation);
        logAudit(intimationId, tid, "APPROVED",
                IntimationStatus.PENDING, IntimationStatus.APPROVED,
                adminId.toString(), actorRole, null);
        log.info("Intimation {} approved by admin {}", intimationId, adminId);
        return toResponse(intimation);
    }

    @Transactional
    public IntimationResponse rejectIntimation(String intimationId, UUID adminId, String reason,
                                               String actorRole) {
        String tid = tenantId();
        PaymentIntimation intimation = findByTenant(intimationId, tid);
        requireStatus(intimation, IntimationStatus.PENDING);

        intimation.setStatus(IntimationStatus.REJECTED);
        intimation.setRejectedBy(adminId.toString());
        intimation.setRejectedAt(LocalDateTime.now());
        intimation.setRejectReason(reason);
        intimationRepository.save(intimation);
        logAudit(intimationId, tid, "REJECTED",
                IntimationStatus.PENDING, IntimationStatus.REJECTED,
                adminId.toString(), actorRole, reason);

        BigDecimal total = intimation.getItems().stream()
                .map(PaymentIntimationItem::getClaimedAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        eventPublisher.publish(new PaymentIntimationNotificationEvent(
                intimationId, intimation.getMemberId(), null, total,
                "REJECTED", reason, tid));

        log.info("Intimation {} rejected by admin {}", intimationId, adminId);
        return toResponse(intimation);
    }

    @Transactional
    public IntimationResponse voidIntimation(String intimationId, UUID adminId, String reason,
                                             String actorRole) {
        String tid = tenantId();
        PaymentIntimation intimation = findByTenant(intimationId, tid);
        requireStatus(intimation, IntimationStatus.APPROVED);

        for (PaymentIntimationItem item : intimation.getItems()) {
            if (item.getPaymentBatchId() != null) {
                VoidPaymentRequest voidReq = new VoidPaymentRequest();
                voidReq.setReason("Voided via payment intimation: " + reason);
                try {
                    paymentService.voidPayment(UUID.fromString(item.getPaymentBatchId()), voidReq, adminId);
                } catch (Exception e) {
                    log.warn("Could not void batch {} during intimation void: {}", item.getPaymentBatchId(), e.getMessage());
                }
            }
        }

        intimation.setStatus(IntimationStatus.VOIDED);
        intimation.setVoidedBy(adminId.toString());
        intimation.setVoidedAt(LocalDateTime.now());
        intimation.setVoidReason(reason);
        intimationRepository.save(intimation);
        logAudit(intimationId, tid, "VOIDED",
                IntimationStatus.APPROVED, IntimationStatus.VOIDED,
                adminId.toString(), actorRole, reason);
        log.info("Intimation {} voided by admin {}", intimationId, adminId);
        return toResponse(intimation);
    }

    public List<IntimationResponse> getMyIntimations(UUID memberId) {
        return intimationRepository
                .findByTenantIdAndMemberIdOrderByCreatedAtDesc(tenantId(), memberId.toString())
                .stream().map(toResponseMapper()).collect(Collectors.toList());
    }

    public List<IntimationResponse> getPendingIntimations() {
        return intimationRepository
                .findByTenantIdAndStatusOrderByCreatedAtDesc(tenantId(), IntimationStatus.PENDING)
                .stream().map(toResponseMapper()).collect(Collectors.toList());
    }

    public List<IntimationResponse> getAllIntimations() {
        return intimationRepository
                .findByTenantIdOrderByCreatedAtDesc(tenantId())
                .stream().map(toResponseMapper()).collect(Collectors.toList());
    }

    public IntimationResponse getById(String intimationId) {
        return toResponse(findByTenant(intimationId, tenantId()));
    }

    public List<PaymentIntimationAuditLogResponse> getHistory(String intimationId) {
        findByTenant(intimationId, tenantId()); // tenant + existence check
        return auditLogRepository.findByIntimationIdOrderByPerformedAtAsc(intimationId)
                .stream().map(PaymentIntimationAuditLogResponse::from).collect(Collectors.toList());
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    private PaymentIntimation findByTenant(String id, String tid) {
        PaymentIntimation intimation = intimationRepository.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.INTIMATION_NOT_FOUND,
                        ErrorCode.INTIMATION_NOT_FOUND.getDefaultMessage()));
        if (!tid.equals(intimation.getTenantId())) {
            throw new BusinessException(ErrorCode.FORBIDDEN, "Access denied");
        }
        return intimation;
    }

    private PaymentIntimation findOwned(String id, String memberId) {
        PaymentIntimation intimation = findByTenant(id, tenantId());
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
        return toResponseMapper().apply(i);
    }

    /**
     * Maps intimations to responses, resolving chit names and the name/role of
     * whoever approved, rejected or voided them. Lookups are cached for the
     * lifetime of the returned mapper so a list call fetches each name once.
     */
    private java.util.function.Function<PaymentIntimation, IntimationResponse> toResponseMapper() {
        Map<String, String> userNames = new HashMap<>();
        Map<String, String> chitNames = new HashMap<>();
        return i -> {
            List<IntimationItemResponse> items = i.getItems() == null ? List.of() :
                    i.getItems().stream()
                            .map(it -> IntimationItemResponse.builder()
                                    .id(it.getId())
                                    .chitId(it.getChitId())
                                    .chitName(chitNames.computeIfAbsent(it.getChitId(), this::lookupChitName))
                                    .claimedAmount(it.getClaimedAmount())
                                    .approvedAmount(it.getApprovedAmount())
                                    .paymentBatchId(it.getPaymentBatchId())
                                    .build())
                            .collect(Collectors.toList());
            Map<String, String> actorRoles = i.getApprovedBy() == null && i.getRejectedBy() == null
                    && i.getVoidedBy() == null ? Map.of() : actorRoles(i.getId());
            return IntimationResponse.builder()
                    .id(i.getId())
                    .memberId(i.getMemberId())
                    .status(i.getStatus())
                    .notes(i.getNotes())
                    .rejectReason(i.getRejectReason())
                    .voidReason(i.getVoidReason())
                    .createdAt(i.getCreatedAt())
                    .approvedAt(i.getApprovedAt())
                    .rejectedAt(i.getRejectedAt())
                    .voidedAt(i.getVoidedAt())
                    .approvedBy(i.getApprovedBy())
                    .approvedByName(userName(i.getApprovedBy(), userNames))
                    .approvedByRole(i.getApprovedBy() != null ? actorRoles.getOrDefault("APPROVED", "ADMIN") : null)
                    .rejectedBy(i.getRejectedBy())
                    .rejectedByName(userName(i.getRejectedBy(), userNames))
                    .rejectedByRole(i.getRejectedBy() != null ? actorRoles.getOrDefault("REJECTED", "ADMIN") : null)
                    .voidedBy(i.getVoidedBy())
                    .voidedByName(userName(i.getVoidedBy(), userNames))
                    .voidedByRole(i.getVoidedBy() != null ? actorRoles.getOrDefault("VOIDED", "ADMIN") : null)
                    .items(items)
                    .build();
        };
    }

    /** Action → role of the user who performed it, from the audit trail. */
    private Map<String, String> actorRoles(String intimationId) {
        Map<String, String> roles = new HashMap<>();
        for (PaymentIntimationAuditLog entry : auditLogRepository.findByIntimationIdOrderByPerformedAtAsc(intimationId)) {
            if (entry.getPerformedByRole() != null) roles.put(entry.getAction(), entry.getPerformedByRole());
        }
        return roles;
    }

    private String userName(String userId, Map<String, String> cache) {
        if (userId == null) return null;
        String name = cache.computeIfAbsent(userId, id -> {
            try {
                return userServiceClient.getUserName(UUID.fromString(id));
            } catch (IllegalArgumentException e) {
                return "";
            }
        });
        return name.isBlank() ? null : name;
    }

    private String lookupChitName(String chitId) {
        if (chitId == null) return null;
        try {
            ChitServiceClient.ChitDto chit = chitServiceClient.getChit(UUID.fromString(chitId));
            return chit != null ? chit.getName() : null;
        } catch (IllegalArgumentException e) {
            return null;
        }
    }
}
