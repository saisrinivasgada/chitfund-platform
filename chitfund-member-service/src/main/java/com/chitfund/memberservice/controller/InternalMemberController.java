package com.chitfund.memberservice.controller;

import com.chitfund.memberservice.domain.Member;
import com.chitfund.memberservice.domain.enums.MemberStatus;
import com.chitfund.memberservice.repository.MemberRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.stream.Collectors;

import java.util.Map;
import java.util.UUID;

/**
 * Service-to-service only. Not exposed through the API Gateway.
 * Security: validated by X-Internal-Key header (shared secret).
 * Spring Security permits /internal/** without JWT — this controller does its own check.
 *
 * WHY a separate internal controller and not reuse MemberController?
 * MemberController returns full MemberResponse DTOs for human-facing APIs.
 * Internal callers only need a boolean — sending the full DTO wastes bandwidth
 * and leaks PII (phone, address) to services that don't need it.
 */
@RestController
@RequestMapping("/internal/members")
@RequiredArgsConstructor
public class InternalMemberController {

    private final MemberRepository memberRepository;
    private final com.chitfund.memberservice.client.AuditClient auditClient;

    @Value("${app.internal-key}")
    private String internalKey;

    /**
     * Validates that a member exists and is ACTIVE.
     * Called by payment-service before accepting any payment.
     *
     * Response: 200 {"active": true} or 200 {"active": false}
     * 401 if X-Internal-Key is missing or wrong.
     */
    @GetMapping("/{memberId}/validate")
    public ResponseEntity<Map<String, Object>> validateMember(
            @PathVariable UUID memberId,
            @RequestHeader(value = "X-Internal-Key", required = false) String key,
            @RequestHeader(value = "X-Tenant-ID", required = false) String tenantId) {

        if (!authorized(key, tenantId)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("active", false, "reason", "Unauthorized"));
        }

        boolean active = memberRepository.existsByIdAndTenantIdAndStatusAndDeletedAtIsNull(
                memberId, tenantId, MemberStatus.ACTIVE);
        return ResponseEntity.ok(Map.of(
                "active", active,
                "memberId", memberId.toString()
        ));
    }

    /**
     * Returns the full name of a member for use in notification messages.
     */
    @GetMapping("/{memberId}/name")
    public ResponseEntity<Map<String, String>> getMemberName(
            @PathVariable UUID memberId,
            @RequestHeader(value = "X-Internal-Key", required = false) String key,
            @RequestHeader(value = "X-Tenant-ID", required = false) String tenantId) {
        if (!authorized(key, tenantId)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of());
        }
        return memberRepository.findByIdAndTenantId(memberId, tenantId)
                .filter(member -> member.getDeletedAt() == null)
                .map(m -> ResponseEntity.ok(Map.of("name", m.getFullName() != null ? m.getFullName() : "")))
                .orElse(ResponseEntity.ok(Map.of("name", "")));
    }

    /**
     * Minimal, tenant-scoped recipient data for payment reminders. The caller
     * supplies only the member profile id; phone, name and linked user identity
     * are resolved from the owning service so a client cannot redirect a
     * ChitWise-branded message to an arbitrary number or account.
     */
    @GetMapping("/{memberId}/notification-contact")
    public ResponseEntity<Map<String, String>> getNotificationContact(
            @PathVariable UUID memberId,
            @RequestHeader(value = "X-Internal-Key", required = false) String key,
            @RequestHeader(value = "X-Tenant-ID", required = false) String tenantId) {
        if (!authorized(key, tenantId)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of());
        }
        return memberRepository.findByIdAndTenantId(memberId, tenantId)
                .filter(member -> member.getDeletedAt() == null)
                .map(member -> {
                    Map<String, String> contact = new java.util.LinkedHashMap<>();
                    contact.put("memberId", member.getId().toString());
                    contact.put("fullName", member.getFullName() != null ? member.getFullName() : "");
                    contact.put("phone", member.getPhone() != null ? member.getPhone() : "");
                    contact.put("phoneCountryCode", member.getPhoneCountryCode() != null
                            ? member.getPhoneCountryCode() : "");
                    if (member.getUserId() != null) {
                        contact.put("userId", member.getUserId().toString());
                    }
                    return ResponseEntity.ok(contact);
                })
                .orElse(ResponseEntity.ok(Map.of()));
    }

    /**
     * Reverse-resolve a user-service UUID back to the member profile UUID.
     * Used by payment-service when crediting a cash request: the request stores
     * the user UUID but payment records are keyed by member profile UUID.
     * Returns 200 {"profileId": "..."} or 200 {} if no linked profile found.
     */
    @GetMapping("/by-user/{userId}/tenant/{tenantId}/profile-id")
    public ResponseEntity<Map<String, String>> getProfileIdByUserId(
            @PathVariable UUID userId,
            @PathVariable String tenantId,
            @RequestHeader(value = "X-Internal-Key", required = false) String key,
            @RequestHeader(value = "X-Tenant-ID", required = false) String tenantHeader) {
        if (!authorized(key, tenantHeader) || !tenantId.equals(tenantHeader)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of());
        }
        return memberRepository.findByUserIdAndTenantId(userId, tenantId)
                .map(m -> ResponseEntity.ok(Map.of("profileId", m.getId().toString())))
                .orElse(ResponseEntity.ok(Map.of()));
    }

    /**
     * Called by payment-service after settlement is confirmed.
     * Marks the member INACTIVE so they no longer appear as eligible for new chits.
     */
    @PatchMapping("/{memberId}/deactivate")
    @org.springframework.transaction.annotation.Transactional
    public ResponseEntity<Map<String, Object>> deactivateMember(
            @PathVariable UUID memberId,
            @RequestHeader(value = "X-Internal-Key", required = false) String key,
            @RequestHeader(value = "X-Tenant-ID", required = false) String tenantId) {
        if (!authorized(key, tenantId)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("success", false));
        }
        return memberRepository.findByIdAndTenantId(memberId, tenantId)
                .filter(member -> member.getDeletedAt() == null).map(m -> {
            if (m.getStatus() == MemberStatus.BLACKLISTED) {
                return ResponseEntity.status(HttpStatus.CONFLICT)
                        .body(Map.<String, Object>of("success", false, "reason", "member is blacklisted"));
            }
            MemberStatus previous = m.getStatus();
            if (previous == MemberStatus.INACTIVE) return ResponseEntity.ok(Map.<String, Object>of("success", true));
            m.setStatus(MemberStatus.INACTIVE);
            memberRepository.save(m);
            auditClient.log("MEMBER", m.getId().toString(), "STATUS_CHANGED_BY_SETTLEMENT", null, "SYSTEM",
                    Map.of("status", previous), Map.of("status", m.getStatus()), tenantId);
            return ResponseEntity.ok(Map.<String, Object>of("success", true));
        }).orElse(ResponseEntity.ok(Map.of("success", false, "reason", "not found")));
    }

    /** Called by payment-service after an audited settlement void. Idempotent. */
    @PatchMapping("/{memberId}/activate")
    @org.springframework.transaction.annotation.Transactional
    public ResponseEntity<Map<String, Object>> activateMember(
            @PathVariable UUID memberId,
            @RequestHeader(value = "X-Internal-Key", required = false) String key,
            @RequestHeader(value = "X-Tenant-ID", required = false) String tenantId) {
        if (!authorized(key, tenantId)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("success", false));
        }
        return memberRepository.findByIdAndTenantId(memberId, tenantId)
                .filter(member -> member.getDeletedAt() == null).map(m -> {
            if (m.getStatus() == MemberStatus.BLACKLISTED) {
                return ResponseEntity.status(HttpStatus.CONFLICT)
                        .body(Map.<String, Object>of("success", false, "reason", "member is blacklisted"));
            }
            MemberStatus previous = m.getStatus();
            if (previous == MemberStatus.ACTIVE) return ResponseEntity.ok(Map.<String, Object>of("success", true));
            m.setStatus(MemberStatus.ACTIVE);
            memberRepository.save(m);
            auditClient.log("MEMBER", m.getId().toString(), "STATUS_CHANGED_BY_SETTLEMENT", null, "SYSTEM",
                    Map.of("status", previous), Map.of("status", m.getStatus()), tenantId);
            return ResponseEntity.ok(Map.<String, Object>of("success", true));
        }).orElse(ResponseEntity.ok(Map.of("success", false, "reason", "not found")));
    }

    /**
     * Batch-resolve member profile IDs → user IDs for notification delivery.
     * Returns a map of { memberId → userId } for members that have an app account.
     */
    @PostMapping("/batch-user-ids")
    public ResponseEntity<Map<String, String>> batchGetUserIds(
            @RequestBody List<String> memberIds,
            @RequestHeader(value = "X-Internal-Key", required = false) String key,
            @RequestHeader(value = "X-Tenant-ID", required = false) String tenantId) {
        if (!authorized(key, tenantId)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of());
        }
        List<UUID> ids = memberIds.stream().map(UUID::fromString).toList();
        List<Member> members = memberRepository
                .findAllByTenantIdAndIdInAndDeletedAtIsNull(tenantId, ids);
        Map<String, String> result = members.stream()
                .filter(m -> m.getUserId() != null)
                .collect(Collectors.toMap(
                        m -> m.getId().toString(),
                        m -> m.getUserId().toString()
                ));
        return ResponseEntity.ok(result);
    }

    @PutMapping("/{memberId}/app-access")
    @org.springframework.transaction.annotation.Transactional
    public ResponseEntity<Map<String, Object>> activateAppAccess(
            @PathVariable UUID memberId,
            @RequestBody Map<String, String> body,
            @RequestHeader(value = "X-Internal-Key", required = false) String key,
            @RequestHeader(value = "X-Tenant-ID", required = false) String tenantHeader) {
        if (!authorized(key, tenantHeader)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("success", false));
        }
        String tenantId = body.get("tenantId");
        String userId = body.get("userId");
        if (tenantId == null || userId == null || !tenantId.equals(tenantHeader)) {
            return ResponseEntity.badRequest().body(Map.of("success", false, "reason", "tenantId and userId are required"));
        }
        return memberRepository.findByIdAndTenantId(memberId, tenantId)
                .filter(member -> member.getDeletedAt() == null)
                .map(member -> {
            UUID requestedUserId = UUID.fromString(userId);
            if (member.getStatus() == MemberStatus.BLACKLISTED) {
                return ResponseEntity.status(HttpStatus.CONFLICT)
                        .body(Map.<String, Object>of("success", false, "reason", "member is blacklisted"));
            }
            if (member.getUserId() != null && !member.getUserId().equals(requestedUserId)) {
                return ResponseEntity.status(HttpStatus.CONFLICT)
                        .body(Map.<String, Object>of("success", false, "reason", "member is linked to another user"));
            }
            if (memberRepository.existsByUserIdAndTenantId(requestedUserId, tenantId)
                    && !requestedUserId.equals(member.getUserId())) {
                return ResponseEntity.status(HttpStatus.CONFLICT)
                        .body(Map.<String, Object>of("success", false, "reason", "user is linked to another member"));
            }
            UUID previousUserId = member.getUserId();
            MemberStatus previousStatus = member.getStatus();
            member.setUserId(requestedUserId);
            memberRepository.save(member);
            if (!requestedUserId.equals(previousUserId) || previousStatus != member.getStatus()) {
                var before = new java.util.LinkedHashMap<String, Object>(); before.put("userId", previousUserId); before.put("status", previousStatus);
                auditClient.log("MEMBER", memberId.toString(), "APP_ACCESS_ACTIVATED", null, "SYSTEM", before,
                        Map.of("userId", requestedUserId, "status", member.getStatus()), tenantId);
            }
            return ResponseEntity.ok(Map.<String, Object>of("success", true));
        }).orElse(ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(Map.of("success", false, "reason", "member not found in organization")));
    }

    @GetMapping("/{memberId}/tenant/{tenantId}/exists")
    public ResponseEntity<Map<String, Boolean>> memberProfileExists(
            @PathVariable UUID memberId,
            @PathVariable String tenantId,
            @RequestHeader(value = "X-Internal-Key", required = false) String key,
            @RequestHeader(value = "X-Tenant-ID", required = false) String tenantHeader) {
        if (!authorized(key, tenantHeader) || !tenantId.equals(tenantHeader)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("exists", false));
        }
        return ResponseEntity.ok(Map.of("exists",
                memberRepository.findByIdAndTenantId(memberId, tenantId)
                        .filter(member -> member.getDeletedAt() == null)
                        .isPresent()));
    }

    private boolean authorized(String key, String tenantId) {
        return internalKey.equals(key) && tenantId != null && !tenantId.isBlank();
    }
}
