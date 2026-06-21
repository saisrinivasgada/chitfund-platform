package com.chitfund.chitservice.service;

import com.chitfund.chitservice.domain.entity.Chit;
import com.chitfund.chitservice.domain.entity.ChitEnrollment;
import com.chitfund.chitservice.domain.enums.ChitStatus;
import com.chitfund.chitservice.dto.request.EnrollMemberRequest;
import com.chitfund.chitservice.dto.response.ChitEnrollmentResponse;
import com.chitfund.chitservice.mapper.ChitMapper;
import com.chitfund.chitservice.repository.ChitEnrollmentRepository;
import com.chitfund.common.exception.BusinessException;
import com.chitfund.common.exception.ErrorCode;
import com.chitfund.common.exception.ResourceNotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class EnrollmentService {

    private final ChitService chitService;
    private final ChitEnrollmentRepository enrollmentRepository;
    private final ChitMapper chitMapper;

    @Transactional
    public ChitEnrollmentResponse enrollMember(UUID chitId, EnrollMemberRequest request) {
        Chit chit = chitService.findById(chitId);

        if (chit.getStatus() != ChitStatus.DRAFT && chit.getStatus() != ChitStatus.ACTIVE) {
            throw new BusinessException(ErrorCode.CHIT_NOT_EDITABLE,
                    "Members can only be enrolled when the chit is in DRAFT or ACTIVE status");
        }
        long currentCount = enrollmentRepository.countByChitIdAndActiveTrue(chitId);
        if (currentCount >= chit.getTotalMembers()) {
            throw new BusinessException(ErrorCode.CHIT_AT_CAPACITY);
        }

        ChitEnrollment enrollment = ChitEnrollment.builder()
                .chit(chit)
                .memberId(request.getMemberId())
                .build();

        return chitMapper.toEnrollmentResponse(enrollmentRepository.save(enrollment));
    }

    public List<ChitEnrollmentResponse> listEnrollments(UUID chitId) {
        chitService.findById(chitId); // validate chit exists
        return enrollmentRepository.findByChitIdAndActiveTrue(chitId)
                .stream()
                .map(chitMapper::toEnrollmentResponse)
                .collect(Collectors.toList());
    }

    @Transactional
    public void removeEnrollment(UUID chitId, UUID memberId) {
        Chit chit = chitService.findById(chitId);

        if (chit.getStatus() != ChitStatus.DRAFT && chit.getStatus() != ChitStatus.ACTIVE) {
            throw new BusinessException(ErrorCode.CHIT_NOT_EDITABLE,
                    "Enrollments can only be modified when the chit is in DRAFT or ACTIVE status");
        }
        ChitEnrollment enrollment = enrollmentRepository
                .findFirstActiveSpot(chitId, memberId)
                .orElseThrow(() -> new ResourceNotFoundException("Enrollment", memberId));

        enrollment.setActive(false);
        enrollmentRepository.save(enrollment);
    }
}
