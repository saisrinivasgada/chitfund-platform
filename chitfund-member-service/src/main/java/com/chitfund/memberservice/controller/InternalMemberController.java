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
            @RequestHeader(value = "X-Internal-Key", required = false) String key) {

        if (!internalKey.equals(key)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("active", false, "reason", "Unauthorized"));
        }

        boolean active = memberRepository.existsByIdAndStatus(memberId, MemberStatus.ACTIVE);
        return ResponseEntity.ok(Map.of(
                "active", active,
                "memberId", memberId.toString()
        ));
    }

    /**
     * Batch-resolve member profile IDs → user IDs for notification delivery.
     * Returns a map of { memberId → userId } for members that have an app account.
     */
    @PostMapping("/batch-user-ids")
    public ResponseEntity<Map<String, String>> batchGetUserIds(
            @RequestBody List<String> memberIds,
            @RequestHeader(value = "X-Internal-Key", required = false) String key) {
        if (!internalKey.equals(key)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of());
        }
        List<UUID> ids = memberIds.stream().map(UUID::fromString).toList();
        List<Member> members = memberRepository.findAllById(ids);
        Map<String, String> result = members.stream()
                .filter(m -> m.getUserId() != null)
                .collect(Collectors.toMap(
                        m -> m.getId().toString(),
                        m -> m.getUserId().toString()
                ));
        return ResponseEntity.ok(result);
    }
}
