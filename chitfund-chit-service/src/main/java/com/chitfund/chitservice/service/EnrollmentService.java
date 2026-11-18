package com.chitfund.chitservice.service;

import com.chitfund.chitservice.client.AuditClient;
import com.chitfund.chitservice.client.PaymentServiceClient;
import com.chitfund.chitservice.domain.entity.Chit;
import com.chitfund.chitservice.domain.entity.ChitEnrollment;
import com.chitfund.chitservice.domain.enums.ChitStatus;
import com.chitfund.chitservice.dto.request.EnrollMemberRequest;
import com.chitfund.chitservice.dto.response.ChitEnrollmentResponse;
import com.chitfund.chitservice.mapper.ChitMapper;
import com.chitfund.chitservice.repository.ChitEnrollmentRepository;
import com.chitfund.common.context.TenantContext;
import com.chitfund.common.exception.BusinessException;
import com.chitfund.common.exception.ErrorCode;
import com.chitfund.common.exception.ResourceNotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class EnrollmentService {

    private final ChitService chitService;
    private final ChitEnrollmentRepository enrollmentRepository;
    private final ChitMapper chitMapper;
    private final PlanLimitChecker planLimitChecker;
    private final AuditClient auditClient;
    private final PaymentServiceClient paymentServiceClient;

    @Transactional
    public ChitEnrollmentResponse enrollMember(UUID chitId, EnrollMemberRequest request) {
        planLimitChecker.checkNotExpired();
        Chit chit = chitService.findByIdForUpdate(chitId);

        if (chit.getStatus() != ChitStatus.DRAFT && chit.getStatus() != ChitStatus.ACTIVE) {
            throw new BusinessException(ErrorCode.CHIT_NOT_EDITABLE,
                    "Members can only be enrolled when the chit is in DRAFT or ACTIVE status");
        }
        long currentCount = enrollmentRepository.countByChitIdAndActiveTrue(chitId);
        if (currentCount >= chit.getCapacity()) {
            throw new BusinessException(ErrorCode.CHIT_AT_CAPACITY);
        }

        ChitEnrollment enrollment = ChitEnrollment.builder()
                .chit(chit)
                .memberId(request.getMemberId())
                .build();

        ChitEnrollmentResponse response = chitMapper.toEnrollmentResponse(enrollmentRepository.save(enrollment));

        auditClient.log("ENROLLMENT", response.getId().toString(), chitId.toString(),
                "ENROLLMENT_ADDED", null, null,
                null,
                Map.of("memberId", request.getMemberId().toString(), "chitId", chitId.toString()),
                TenantContext.get());

        // For mid-run joins, schedule catch-up dues creation AFTER this transaction commits.
        // Using afterCommit prevents calling payment-service on a rolled-back enrollment,
        // and prevents orphan dues from outliving a failed approval.
        if (chit.getStatus() == ChitStatus.ACTIVE) {
            final UUID memberId = request.getMemberId();
            final String tenantId = TenantContext.get();
            if (TransactionSynchronizationManager.isSynchronizationActive()) {
                TransactionSynchronizationManager.registerSynchronization(
                        new TransactionSynchronization() {
                            @Override
                            public void afterCommit() {
                                paymentServiceClient.createLateJoinDues(chitId, memberId, tenantId, null);
                            }
                        });
            } else {
                paymentServiceClient.createLateJoinDues(chitId, memberId, tenantId, null);
            }
        }

        return response;
    }

    public List<ChitEnrollmentResponse> listEnrollments(UUID chitId) {
        chitService.findByIdScoped(chitId); // validate tenant ownership
        return enrollmentRepository.findByChitIdAndActiveTrue(chitId)
                .stream()
                .map(chitMapper::toEnrollmentResponse)
                .collect(Collectors.toList());
    }

    @Transactional
    public void removeEnrollment(UUID chitId, UUID memberId) {
        Chit chit = chitService.findByIdForUpdate(chitId);

        if (chit.getStatus() != ChitStatus.DRAFT && chit.getStatus() != ChitStatus.ACTIVE) {
            throw new BusinessException(ErrorCode.CHIT_NOT_EDITABLE,
                    "Enrollments can only be modified when the chit is in DRAFT or ACTIVE status");
        }
        ChitEnrollment enrollment = enrollmentRepository
                .findFirstActiveSpot(chitId, memberId)
                .orElseThrow(() -> new ResourceNotFoundException("Enrollment", memberId));

        enrollment.setActive(false);
        enrollmentRepository.save(enrollment);

        auditClient.log("ENROLLMENT", enrollment.getId().toString(), chitId.toString(),
                "ENROLLMENT_REMOVED", null, null,
                Map.of("memberId", memberId.toString(), "chitId", chitId.toString()),
                null,
                TenantContext.get());
    }
}
