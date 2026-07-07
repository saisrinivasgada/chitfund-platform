package com.chitfund.memberservice.service;

import com.chitfund.common.exception.BusinessException;
import com.chitfund.common.exception.ErrorCode;
import com.chitfund.memberservice.domain.Member;
import com.chitfund.memberservice.domain.enums.MemberStatus;
import com.chitfund.memberservice.dto.request.CreateMemberRequest;
import com.chitfund.memberservice.dto.request.LinkUserRequest;
import com.chitfund.memberservice.dto.request.UpdateMemberProfileRequest;
import com.chitfund.memberservice.dto.request.UpdateMemberRequest;
import com.chitfund.memberservice.dto.request.UpdateStatusRequest;
import com.chitfund.memberservice.dto.response.MemberResponse;
import com.chitfund.memberservice.repository.MemberRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class MemberService {

    private final MemberRepository memberRepository;

    @Transactional
    public MemberResponse createMember(CreateMemberRequest request, UUID adminId) {
        if (memberRepository.existsByPhoneAndDeletedAtIsNull(request.getPhone())) {
            throw new BusinessException(ErrorCode.MEMBER_PHONE_TAKEN,
                    "A member with phone " + request.getPhone() + " already exists");
        }

        if (request.getUserId() != null && memberRepository.existsByUserId(request.getUserId())) {
            throw new BusinessException(ErrorCode.MEMBER_USER_ALREADY_LINKED,
                    "This user account is already linked to another member");
        }

        if (request.getReferredById() != null && !memberRepository.existsById(request.getReferredById())) {
            throw new BusinessException(ErrorCode.MEMBER_NOT_FOUND, "Referring member not found");
        }

        Member member = Member.builder()
                .fullName(request.getFullName())
                .phone(request.getPhone())
                .phoneCountryCode(request.getPhoneCountryCode() != null ? request.getPhoneCountryCode() : "+91")
                .email(request.getEmail())
                .address(request.getAddress())
                .city(request.getCity())
                .aadhaarLast4(request.getAadhaarLast4())
                .panNumber(request.getPanNumber())
                .bankName(request.getBankName())
                .bankAccountNumber(request.getBankAccountNumber())
                .bankIfsc(request.getBankIfsc())
                .userId(request.getUserId())
                .notes(request.getNotes())
                .referredById(request.getReferredById())
                .createdBy(adminId)
                .build();

        memberRepository.save(member);
        log.info("Admin {} created member {} ({})", adminId, member.getId(), member.getPhone());
        return toResponse(member);
    }

    @Transactional(readOnly = true)
    public MemberResponse getById(UUID id) {
        return toResponse(findOrThrow(id));
    }

    @Transactional(readOnly = true)
    public MemberResponse getByPhone(String phone) {
        return memberRepository.findByPhoneAndDeletedAtIsNull(phone)
                .map(this::toResponse)
                .orElseThrow(() -> new BusinessException(ErrorCode.MEMBER_NOT_FOUND,
                        "No member found with phone " + phone));
    }

    /**
     * Used by the /me endpoint — member's JWT contains userId, not memberId.
     * This bridges the gap between auth identity and chit fund identity.
     */
    @Transactional(readOnly = true)
    public MemberResponse getByUserId(UUID userId) {
        return memberRepository.findByUserId(userId)
                .map(this::toResponse)
                .orElseThrow(() -> new BusinessException(ErrorCode.MEMBER_NOT_FOUND,
                        "No member profile linked to this user account"));
    }

    @Transactional(readOnly = true)
    public Page<MemberResponse> search(String search, MemberStatus status, Pageable pageable) {
        return memberRepository.search(search, status, pageable).map(this::toResponse);
    }

    @Transactional(readOnly = true)
    public Page<MemberResponse> searchDeleted(String search, Pageable pageable) {
        return memberRepository.searchDeleted(search, pageable).map(this::toResponse);
    }

    @Transactional
    public MemberResponse softDelete(UUID id, UUID deletedBy) {
        Member member = findOrThrow(id);
        if (member.getDeletedAt() != null) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED, "Member is already deleted");
        }
        member.setDeletedAt(LocalDateTime.now());
        member.setDeletedBy(deletedBy);
        memberRepository.save(member);
        log.info("Admin {} soft-deleted member {}", deletedBy, id);
        return toResponse(member);
    }

    @Transactional
    public MemberResponse updateMember(UUID id, UpdateMemberRequest request) {
        Member member = findOrThrow(id);

        member.setFullName(request.getFullName());

        if (request.getPhone() != null && !request.getPhone().equals(member.getPhone())) {
            if (memberRepository.existsByPhoneAndDeletedAtIsNull(request.getPhone())) {
                throw new BusinessException(ErrorCode.MEMBER_PHONE_TAKEN,
                        "A member with phone " + request.getPhone() + " already exists");
            }
            member.setPhone(request.getPhone());
        }
        if (request.getPhoneCountryCode() != null) member.setPhoneCountryCode(request.getPhoneCountryCode());

        member.setEmail(request.getEmail());
        member.setAddress(request.getAddress());
        member.setCity(request.getCity());
        member.setAadhaarLast4(request.getAadhaarLast4());
        member.setPanNumber(request.getPanNumber());
        member.setBankName(request.getBankName());
        member.setBankAccountNumber(request.getBankAccountNumber());
        member.setBankIfsc(request.getBankIfsc());
        member.setNotes(request.getNotes());
        if (request.getReferredById() != null && !memberRepository.existsById(request.getReferredById())) {
            throw new BusinessException(ErrorCode.MEMBER_NOT_FOUND, "Referring member not found");
        }
        member.setReferredById(request.getReferredById());

        memberRepository.save(member);
        log.info("Member {} updated", id);
        return toResponse(member);
    }

    @Transactional
    public MemberResponse updateStatus(UUID id, UpdateStatusRequest request) {
        if (request.getStatus() == MemberStatus.BLACKLISTED
                && (request.getReason() == null || request.getReason().isBlank())) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    "A reason is required when blacklisting a member",
                    HttpStatus.BAD_REQUEST);
        }

        Member member = findOrThrow(id);
        MemberStatus previous = member.getStatus();
        member.setStatus(request.getStatus());

        if (request.getStatus() == MemberStatus.BLACKLISTED && request.getReason() != null) {
            String note = "[BLACKLISTED] " + request.getReason();
            member.setNotes(member.getNotes() != null ? member.getNotes() + "\n" + note : note);
        }

        memberRepository.save(member);
        log.info("Member {} status changed {} → {}", id, previous, request.getStatus());
        return toResponse(member);
    }

    @Transactional
    public MemberResponse linkUserAccount(UUID memberId, LinkUserRequest request) {
        Member member = findOrThrow(memberId);

        // Idempotent: already linked to this exact user → return success
        if (request.getUserId().equals(member.getUserId())) {
            return toResponse(member);
        }

        // Reject if this userId is already linked to a DIFFERENT member
        if (memberRepository.existsByUserId(request.getUserId())) {
            throw new BusinessException(ErrorCode.MEMBER_USER_ALREADY_LINKED,
                    "This user account is already linked to another member");
        }

        member.setUserId(request.getUserId());
        memberRepository.save(member);
        log.info("Member {} linked to user account {}", memberId, request.getUserId());
        return toResponse(member);
    }

    @Transactional
    public MemberResponse updateMyProfile(UUID userId, UpdateMemberProfileRequest request) {
        Member member = memberRepository.findByUserId(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.MEMBER_NOT_FOUND,
                        "No member profile linked to this user account"));

        if (request.getFullName() != null) member.setFullName(request.getFullName());
        if (request.getPhone() != null && !request.getPhone().equals(member.getPhone())) {
            if (memberRepository.existsByPhoneAndDeletedAtIsNull(request.getPhone())) {
                throw new BusinessException(ErrorCode.MEMBER_PHONE_TAKEN);
            }
            member.setPhone(request.getPhone());
        }
        if (request.getEmail() != null) member.setEmail(request.getEmail());
        if (request.getAddress() != null) member.setAddress(request.getAddress());
        if (request.getCity() != null) member.setCity(request.getCity());
        if (request.getPhoneCountryCode() != null) member.setPhoneCountryCode(request.getPhoneCountryCode());

        return toResponse(memberRepository.save(member));
    }

    private Member findOrThrow(UUID id) {
        return memberRepository.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.MEMBER_NOT_FOUND,
                        "Member not found: " + id));
    }

    private MemberResponse toResponse(Member m) {
        String referredByName = m.getReferredById() != null
                ? memberRepository.findById(m.getReferredById())
                        .map(Member::getFullName)
                        .orElse(null)
                : null;

        return MemberResponse.builder()
                .id(m.getId())
                .fullName(m.getFullName())
                .phone(m.getPhone())
                .phoneCountryCode(m.getPhoneCountryCode() != null ? m.getPhoneCountryCode() : "+91")
                .email(m.getEmail())
                .address(m.getAddress())
                .city(m.getCity())
                .aadhaarLast4(m.getAadhaarLast4())
                .panNumber(m.getPanNumber())
                .bankName(m.getBankName())
                .bankAccountNumber(m.getBankAccountNumber())
                .bankIfsc(m.getBankIfsc())
                .status(m.getStatus())
                .userId(m.getUserId())
                .hasAppAccess(m.getUserId() != null)
                .notes(m.getNotes())
                .referredById(m.getReferredById())
                .referredByName(referredByName)
                .createdBy(m.getCreatedBy())
                .createdAt(m.getCreatedAt())
                .updatedAt(m.getUpdatedAt())
                .deletedAt(m.getDeletedAt())
                .deletedBy(m.getDeletedBy())
                .build();
    }
}
