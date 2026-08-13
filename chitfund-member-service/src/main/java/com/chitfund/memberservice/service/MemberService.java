package com.chitfund.memberservice.service;

import com.chitfund.common.context.TenantContext;
import com.chitfund.common.event.MemberUpdatedEvent;
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
import com.chitfund.memberservice.client.AuditClient;
import com.chitfund.memberservice.client.UserServiceClient;
import com.chitfund.memberservice.messaging.MemberEventPublisher;
import com.chitfund.memberservice.repository.MemberRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDateTime;
import java.util.Objects;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class MemberService {

    private final MemberRepository memberRepository;
    private final MemberEventPublisher memberEventPublisher;
    private final AuditClient auditClient;
    private final UserServiceClient userServiceClient;
    private final PlanLimitChecker planLimitChecker;

    private String tenantId() {
        String tid = TenantContext.get();
        // Fallback to Kethaki tenant for backward compatibility during migration
        return tid != null ? tid : "10000000-0000-0000-0000-000000000001";
    }

    @Transactional
    public MemberResponse createMember(CreateMemberRequest request, UUID adminId) {
        planLimitChecker.checkCanAddMember();

        String tid = tenantId();
        String cc = request.getPhoneCountryCode() != null ? request.getPhoneCountryCode() : "+91";

        if (memberRepository.existsByPhoneAndPhoneCountryCodeAndTenantIdAndDeletedAtIsNull(
                request.getPhone(), cc, tid)) {
            throw new BusinessException(ErrorCode.MEMBER_PHONE_TAKEN,
                    "A member with phone " + request.getPhone() + " already exists");
        }
        if (request.getUserId() != null && memberRepository.existsByUserIdAndTenantId(request.getUserId(), tid)) {
            throw new BusinessException(ErrorCode.MEMBER_USER_ALREADY_LINKED,
                    "This user account is already linked to another member");
        }
        if (request.getReferredById() != null && !memberRepository.existsById(request.getReferredById())) {
            throw new BusinessException(ErrorCode.MEMBER_NOT_FOUND, "Referring member not found");
        }

        Member member = Member.builder()
                .tenantId(tid)
                .fullName(request.getFullName())
                .phone(request.getPhone())
                .phoneCountryCode(cc)
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
        log.info("Admin {} created member {} ({}) in tenant {}", adminId, member.getId(), member.getPhone(), tid);

        // Auto link-or-create a user account for this member
        String setupToken = null;
        try {
            java.util.Map<String, String> userResult = userServiceClient.linkOrCreate(
                    tid, member.getId(), member.getPhone(), member.getPhoneCountryCode(),
                    member.getFullName(), member.getEmail());
            if (userResult != null && userResult.get("userId") != null) {
                UUID linkedUserId = UUID.fromString(userResult.get("userId"));
                member.setUserId(linkedUserId);
                memberRepository.save(member);
                setupToken = userResult.get("setupToken");
                log.info("Linked member {} to user {} (new={})", member.getId(), linkedUserId, userResult.get("isNew"));
            }
        } catch (Exception e) {
            log.warn("link-or-create failed for member {}: {}", member.getId(), e.getMessage());
        }

        MemberResponse response = toResponse(member);
        response.setSetupToken(setupToken);
        return response;
    }

    @Transactional(readOnly = true)
    public MemberResponse getById(UUID id) {
        Member member = findOrThrow(id);
        // Tenant isolation check: member must belong to current tenant
        if (!tenantId().equals(member.getTenantId())) {
            throw new BusinessException(ErrorCode.MEMBER_NOT_FOUND, "Member not found: " + id);
        }
        return toResponse(member);
    }

    @Transactional(readOnly = true)
    public MemberResponse getByPhone(String phone) {
        String tid = tenantId();
        return memberRepository.findByPhoneAndDeletedAtIsNull(phone)
                .filter(m -> tid.equals(m.getTenantId()))
                .map(this::toResponse)
                .orElseThrow(() -> new BusinessException(ErrorCode.MEMBER_NOT_FOUND,
                        "No member found with phone " + phone));
    }

    @Transactional(readOnly = true)
    public MemberResponse getByUserId(UUID userId) {
        String tid = tenantId();
        return memberRepository.findByUserIdAndTenantId(userId, tid)
                .map(this::toResponse)
                .orElseThrow(() -> new BusinessException(ErrorCode.MEMBER_NOT_FOUND,
                        "No member profile linked to this user account"));
    }

    @Transactional(readOnly = true)
    public Page<MemberResponse> search(String search, MemberStatus status, Pageable pageable) {
        return memberRepository.search(tenantId(), search, status, pageable).map(this::toResponse);
    }

    @Transactional(readOnly = true)
    public Page<MemberResponse> searchDeleted(String search, Pageable pageable) {
        return memberRepository.searchDeleted(tenantId(), search, pageable).map(this::toResponse);
    }

    @Transactional
    public MemberResponse softDelete(UUID id, UUID deletedBy) {
        Member member = findOrThrowScoped(id);
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
    public MemberResponse updateMember(UUID id, UpdateMemberRequest request, UUID actorId) {
        Member member = findOrThrowScoped(id);
        java.util.Map<String, Object> before = profileSnapshot(member);

        if (request.getFullName() != null) member.setFullName(request.getFullName());

        if (request.getPhone() != null && !request.getPhone().equals(member.getPhone())) {
            String cc = request.getPhoneCountryCode() != null ? request.getPhoneCountryCode() : member.getPhoneCountryCode();
            if (memberRepository.existsByPhoneAndPhoneCountryCodeAndTenantIdAndDeletedAtIsNull(
                    request.getPhone(), cc, tenantId())) {
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

        UUID oldReferredById = member.getReferredById();
        UUID newReferredById = request.getReferredById();
        if (newReferredById != null && !memberRepository.existsById(newReferredById)) {
            throw new BusinessException(ErrorCode.MEMBER_NOT_FOUND, "Referring member not found");
        }
        member.setReferredById(newReferredById);

        memberRepository.save(member);
        log.info("Member {} updated by {}", id, actorId);

        java.util.Map<String, Object> after = profileSnapshot(member);
        auditClient.log("MEMBER", id.toString(), "PROFILE_UPDATED",
                actorId != null ? actorId.toString() : null, "ROLE_ADMIN", before, after,
                com.chitfund.common.context.TenantContext.get());

        if (!Objects.equals(oldReferredById, newReferredById)) {
            String prevName = oldReferredById != null
                    ? memberRepository.findById(oldReferredById).map(Member::getFullName).orElse(null) : null;
            String newName = newReferredById != null
                    ? memberRepository.findById(newReferredById).map(Member::getFullName).orElse(null) : null;
            memberEventPublisher.publish(new MemberUpdatedEvent(
                    id.toString(), "referredById",
                    oldReferredById != null ? oldReferredById.toString() : null,
                    newReferredById != null ? newReferredById.toString() : null,
                    prevName, newName,
                    actorId != null ? actorId.toString() : null,
                    Instant.now()));
        }

        return toResponse(member);
    }

    private java.util.Map<String, Object> profileSnapshot(Member m) {
        java.util.Map<String, Object> map = new java.util.LinkedHashMap<>();
        map.put("fullName", m.getFullName());
        map.put("phone", m.getPhone());
        map.put("email", m.getEmail());
        map.put("address", m.getAddress());
        map.put("city", m.getCity());
        map.put("aadhaarLast4", m.getAadhaarLast4());
        map.put("panNumber", m.getPanNumber());
        map.put("bankName", m.getBankName());
        map.put("bankAccountNumber", m.getBankAccountNumber());
        map.put("bankIfsc", m.getBankIfsc());
        map.put("referredById", m.getReferredById());
        map.put("notes", m.getNotes());
        return map;
    }

    @Transactional
    public MemberResponse updateStatus(UUID id, UpdateStatusRequest request) {
        if (request.getStatus() == MemberStatus.BLACKLISTED
                && (request.getReason() == null || request.getReason().isBlank())) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    "A reason is required when blacklisting a member",
                    HttpStatus.BAD_REQUEST);
        }
        Member member = findOrThrowScoped(id);
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
        Member member = findOrThrowScoped(memberId);
        if (request.getUserId().equals(member.getUserId())) return toResponse(member);
        if (memberRepository.existsByUserIdAndTenantId(request.getUserId(), tenantId())) {
            throw new BusinessException(ErrorCode.MEMBER_USER_ALREADY_LINKED,
                    "This user account is already linked to another member");
        }
        member.setUserId(request.getUserId());
        member.setHasAppAccess(true);
        memberRepository.save(member);
        return toResponse(member);
    }

    @Transactional
    public MemberResponse updateMyProfile(UUID userId, UpdateMemberProfileRequest request) {
        String tid = tenantId();
        Member member = memberRepository.findByUserIdAndTenantId(userId, tid)
                .orElseThrow(() -> new BusinessException(ErrorCode.MEMBER_NOT_FOUND,
                        "No member profile linked to this user account"));

        java.util.Map<String, Object> before = profileSnapshot(member);
        if (request.getFullName() != null) member.setFullName(request.getFullName());
        if (request.getPhone() != null && !request.getPhone().equals(member.getPhone())) {
            String cc = request.getPhoneCountryCode() != null ? request.getPhoneCountryCode() : member.getPhoneCountryCode();
            if (memberRepository.existsByPhoneAndPhoneCountryCodeAndTenantIdAndDeletedAtIsNull(request.getPhone(), cc, tid)) {
                throw new BusinessException(ErrorCode.MEMBER_PHONE_TAKEN);
            }
            member.setPhone(request.getPhone());
        }
        if (request.getEmail() != null) member.setEmail(request.getEmail());
        if (request.getAddress() != null) member.setAddress(request.getAddress());
        if (request.getCity() != null) member.setCity(request.getCity());
        if (request.getPhoneCountryCode() != null) member.setPhoneCountryCode(request.getPhoneCountryCode());

        MemberResponse result = toResponse(memberRepository.save(member));
        auditClient.log("MEMBER", member.getId().toString(), "PROFILE_UPDATED",
                userId.toString(), "ROLE_MEMBER", before, profileSnapshot(member),
                com.chitfund.common.context.TenantContext.get());
        return result;
    }

    private Member findOrThrow(UUID id) {
        return memberRepository.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.MEMBER_NOT_FOUND,
                        "Member not found: " + id));
    }

    // Tenant-scoped findOrThrow: returns 404 for cross-tenant access (no existence disclosure)
    private Member findOrThrowScoped(UUID id) {
        Member m = findOrThrow(id);
        if (!tenantId().equals(m.getTenantId())) {
            throw new BusinessException(ErrorCode.MEMBER_NOT_FOUND, "Member not found: " + id);
        }
        return m;
    }

    private MemberResponse toResponse(Member m) {
        String referredByName = m.getReferredById() != null
                ? memberRepository.findById(m.getReferredById()).map(Member::getFullName).orElse(null)
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
                .hasAppAccess(m.isHasAppAccess())
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
