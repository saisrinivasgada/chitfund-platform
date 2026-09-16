package com.chitfund.userservice.service;

import com.chitfund.common.exception.BusinessException;
import com.chitfund.common.exception.ErrorCode;
import com.chitfund.userservice.domain.entity.*;
import com.chitfund.userservice.domain.enums.Role;
import com.chitfund.userservice.dto.request.PhoneReassignmentExecutionRequest;
import com.chitfund.userservice.dto.response.ChitfundRequestResponse;
import com.chitfund.userservice.repository.*;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.context.ApplicationEventPublisher;

import java.time.LocalDateTime;
import java.util.*;

@Service
@RequiredArgsConstructor
public class IdentityReassignmentService {
    private final IdentityOperationExecutionRepository executionRepository;
    private final RetiredPhoneIdentityRepository retiredPhoneRepository;
    private final UserRepository userRepository;
    private final RefreshTokenRepository refreshTokenRepository;
    private final TrustedDeviceRepository trustedDeviceRepository;
    private final PasswordEncoder passwordEncoder;
    private final ChitfundRequestService chitfundRequestService;
    private final ObjectMapper objectMapper;
    private final com.chitfund.userservice.client.MemberServiceClient memberServiceClient;
    private final MemberUserLinkRepository memberLinkRepository;
    private final ApplicationEventPublisher eventPublisher;

    @Transactional
    public Map<String, Object> execute(PhoneReassignmentExecutionRequest request) {
        String hash = requestHash(request);
        executionRepository.insertIfAbsent(request.getOperationId(), hash);
        IdentityOperationExecution execution = executionRepository.findByIdForUpdate(request.getOperationId())
                .orElseThrow(() -> new IllegalStateException("Identity execution could not be claimed"));
        if (!execution.getRequestHash().equals(hash)) {
            throw new BusinessException(ErrorCode.CONCURRENT_MODIFICATION,
                    "The idempotency key was already used for a different identity operation");
        }
        if ("COMPLETED".equals(execution.getStatus())) return readResult(execution.getResultJson());

        User oldUser = userRepository.findById(request.getOldUserId())
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND, "Old identity not found"));
        List<UUID> affectedTenantIds = memberLinkRepository.findAllByUserId(oldUser.getId())
                .stream().map(MemberUserLink::getTenantId).distinct().toList();
        if (oldUser.getRole() != Role.MEMBER) {
            throw new BusinessException(ErrorCode.FORBIDDEN, "Only a member phone identity can be retired");
        }
        String phone = normalizePhone(request.getPhone());
        String countryCode = request.getPhoneCountryCode().trim();
        if (!Objects.equals(normalizePhone(oldUser.getPhone()), phone)
                || !Objects.equals(oldUser.getPhoneCountryCode(), countryCode)) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    "The approved phone no longer belongs to the old identity. Re-investigation is required.");
        }
        List<User> matches = userRepository.findByPhoneAndPhoneCountryCodeAndDeletedAtIsNull(phone, countryCode);
        if (matches.size() != 1 || !matches.get(0).getId().equals(oldUser.getId())) {
            throw new BusinessException(ErrorCode.CONCURRENT_MODIFICATION,
                    "The phone identity changed after approval. Re-investigation is required.");
        }
        String newEmail = request.getEmail().trim().toLowerCase();
        userRepository.findByEmail(newEmail).ifPresent(existing -> {
            throw new BusinessException(ErrorCode.EMAIL_TAKEN,
                    "The proposed new email already belongs to a ChitWise account");
        });
        Set<String> approvedProfiles = new HashSet<>();
        for (PhoneReassignmentExecutionRequest.MemberLink link : request.getApprovedMemberLinks()) {
            String key = link.getTenantId() + ":" + link.getMemberId();
            if (!approvedProfiles.add(key)) {
                throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                        "The same member profile was approved more than once");
            }
            if (!memberServiceClient.memberProfileExists(link.getTenantId(), link.getMemberId())) {
                throw new BusinessException(ErrorCode.RESOURCE_NOT_FOUND,
                        "An approved member profile no longer exists in its organization");
            }
        }

        retiredPhoneRepository.save(RetiredPhoneIdentity.builder()
                .operationId(request.getOperationId())
                .userId(oldUser.getId())
                .phoneHash(AuthService.sha256Value(countryCode + ":" + phone))
                .countryCode(countryCode)
                .build());
        oldUser.setPhone(null);
        oldUser.setPhoneCountryCode(null);
        oldUser.setPasswordResetToken(null);
        oldUser.setPasswordResetTokenExpiresAt(null);
        refreshTokenRepository.revokeAllActiveByUser(oldUser);
        trustedDeviceRepository.deleteByUserId(oldUser.getId());
        userRepository.save(oldUser);

        User newUser = userRepository.save(User.builder()
                .username(pendingUsername(phone))
                .phone(phone)
                .phoneCountryCode(countryCode)
                .passwordHash(passwordEncoder.encode(UUID.randomUUID().toString()))
                .role(Role.MEMBER)
                .enabled(true)
                .hasAppAccess(false)
                .mustChangePassword(true)
                .build());

        List<String> requestIds = new ArrayList<>();
        for (PhoneReassignmentExecutionRequest.MemberLink link : request.getApprovedMemberLinks()) {
            ChitfundRequestResponse created = chitfundRequestService.replaceForApprovedPhoneReassignment(
                    link.getTenantId(), link.getMemberId(), phone, countryCode,
                    newEmail, newUser.getId(), request.getOperationId());
            requestIds.add(created.getId().toString());
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("newUserId", newUser.getId().toString());
        result.put("requestIds", requestIds);
        result.put("status", "COMPLETED");
        try {
            execution.setResultJson(objectMapper.writeValueAsString(result));
        } catch (JsonProcessingException ex) {
            throw new IllegalStateException("Could not record identity execution", ex);
        }
        execution.setNewUserId(newUser.getId());
        execution.setStatus("COMPLETED");
        execution.setCompletedAt(LocalDateTime.now());
        executionRepository.save(execution);
        eventPublisher.publishEvent(new IdentityNotificationEvent(
                IdentityNotificationEvent.Type.PHONE_IDENTITY_REASSIGNED,
                oldUser.getId(), null, null, affectedTenantIds));
        return result;
    }

    private String pendingUsername(String phone) {
        String base = "pending_" + phone;
        String candidate = base;
        int suffix = 1;
        while (userRepository.existsByUsername(candidate)) candidate = base + "_" + suffix++;
        return candidate;
    }

    private String requestHash(PhoneReassignmentExecutionRequest request) {
        String links = request.getApprovedMemberLinks().stream()
                .map(l -> l.getTenantId() + ":" + l.getMemberId()).sorted()
                .reduce((a, b) -> a + "|" + b).orElse("");
        return AuthService.sha256Value(request.getOldUserId() + "|" + request.getPhoneCountryCode().trim()
                + "|" + normalizePhone(request.getPhone()) + "|"
                + request.getEmail().trim().toLowerCase() + "|" + links);
    }

    private Map<String, Object> readResult(String json) {
        try {
            return objectMapper.readValue(json, new TypeReference<>() {});
        } catch (JsonProcessingException ex) {
            throw new IllegalStateException("Stored identity result is unreadable", ex);
        }
    }

    private static String normalizePhone(String value) { return value == null ? "" : value.replaceAll("\\D", ""); }
}
