package com.chitfund.memberservice.controller;

import com.chitfund.common.dto.ApiResponse;
import com.chitfund.memberservice.domain.enums.MemberStatus;
import com.chitfund.memberservice.dto.request.CreateMemberRequest;
import com.chitfund.memberservice.dto.request.LinkUserRequest;
import com.chitfund.memberservice.dto.request.UpdateMemberProfileRequest;
import com.chitfund.memberservice.dto.request.UpdateMemberRequest;
import com.chitfund.memberservice.dto.request.UpdateStatusRequest;
import com.chitfund.memberservice.dto.response.MemberResponse;
import com.chitfund.memberservice.service.MemberService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/members")
@RequiredArgsConstructor
public class MemberController {

    private final MemberService memberService;

    @GetMapping("/phone-taken")
    @PreAuthorize("hasAnyAuthority('ROLE_ADMIN', 'ROLE_MANAGER')")
    public ResponseEntity<ApiResponse<Map<String, Boolean>>> isPhoneTaken(
            @RequestParam String phone,
            @RequestParam(required = false, defaultValue = "+91") String countryCode) {
        boolean taken = memberService.isPhoneTaken(phone, countryCode);
        return ResponseEntity.ok(ApiResponse.success(Map.of("taken", taken)));
    }

    /**
     * Create a member profile. Admin-only.
     * Phone must be unique — it's the field workers use to identify members in the field.
     */
    @PostMapping
    @PreAuthorize("hasAnyAuthority('ROLE_ADMIN', 'ROLE_MANAGER')")
    public ResponseEntity<ApiResponse<MemberResponse>> createMember(
            @Valid @RequestBody CreateMemberRequest request,
            Authentication auth) {
        UUID adminId = (UUID) auth.getPrincipal();
        String actorRole = auth.getAuthorities().stream()
                .findFirst().map(authority -> authority.getAuthority()).orElse("ROLE_ADMIN");
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(memberService.createMember(request, adminId, actorRole)));
    }

    /**
     * Paginated member list with optional search (name or phone) and status filter.
     * Example: GET /members?search=ravi&status=ACTIVE&page=0&size=20
     */
    @GetMapping
    @PreAuthorize("hasAnyAuthority('ROLE_ADMIN', 'ROLE_MANAGER', 'ROLE_STAFF')")
    public ResponseEntity<ApiResponse<Page<MemberResponse>>> listMembers(
            @RequestParam(required = false) String search,
            @RequestParam(required = false) MemberStatus status,
            @PageableDefault(size = 20) Pageable pageable) {
        return ResponseEntity.ok(ApiResponse.success(memberService.search(search, status, pageable)));
    }

    /**
     * Get a member by ID.
     * Workers need this to verify membership before recording a payment.
     */
    @GetMapping("/{id}")
    @PreAuthorize("hasAnyAuthority('ROLE_ADMIN', 'ROLE_MANAGER', 'ROLE_STAFF')")
    public ResponseEntity<ApiResponse<MemberResponse>> getMember(@PathVariable UUID id) {
        return ResponseEntity.ok(ApiResponse.success(memberService.getById(id)));
    }

    /**
     * Lookup by phone — fastest way for a worker to identify a member during cash collection.
     * Worker types the member's number, gets their profile + outstanding balance (from payment-service).
     */
    @GetMapping("/by-phone/{phone}")
    @PreAuthorize("hasAnyAuthority('ROLE_ADMIN', 'ROLE_MANAGER', 'ROLE_STAFF')")
    public ResponseEntity<ApiResponse<MemberResponse>> getMemberByPhone(@PathVariable String phone) {
        return ResponseEntity.ok(ApiResponse.success(memberService.getByPhone(phone)));
    }

    /**
     * Member views their own profile.
     * JWT subject = userId. member-service looks up memberId via the userId link.
     *
     * WHY not use memberId in the JWT?
     * user-service doesn't know about memberId — it belongs to member-service.
     * The userId→memberId lookup is a simple SELECT by indexed column, one call total.
     */
    @GetMapping("/me")
    @PreAuthorize("hasAuthority('ROLE_MEMBER')")
    public ResponseEntity<ApiResponse<MemberResponse>> getMyProfile(Authentication auth) {
        UUID userId = (UUID) auth.getPrincipal();
        return ResponseEntity.ok(ApiResponse.success(memberService.getByUserId(userId)));
    }

    /**
     * Admin updates member info (name, email, address, KYC, bank details).
     * Phone is NOT updatable here — it's unique and used as a field identifier.
     */
    @PutMapping("/{id}")
    @PreAuthorize("hasAuthority('ROLE_ADMIN')")
    public ResponseEntity<ApiResponse<MemberResponse>> updateMember(
            @PathVariable UUID id,
            @Valid @RequestBody UpdateMemberRequest request,
            Authentication auth) {
        UUID actorId = auth != null ? (UUID) auth.getPrincipal() : null;
        return ResponseEntity.ok(ApiResponse.success(memberService.updateMember(id, request, actorId)));
    }

    /**
     * Member updates their own contact info (phone, email, address, city).
     * Deliberately excludes name, KYC, and bank — those are admin-controlled.
     */
    @PatchMapping("/me/profile")
    @PreAuthorize("hasAuthority('ROLE_MEMBER')")
    public ResponseEntity<ApiResponse<MemberResponse>> updateMyProfile(
            @Valid @RequestBody UpdateMemberProfileRequest request,
            Authentication auth) {
        UUID userId = (UUID) auth.getPrincipal();
        return ResponseEntity.ok(ApiResponse.success(memberService.updateMyProfile(userId, request)));
    }

    /** Legacy URL retained to return a clear forbidden response from the service. */
    @PatchMapping("/{id}/link-user")
    @PreAuthorize("hasAuthority('ROLE_ADMIN')")
    public ResponseEntity<ApiResponse<MemberResponse>> linkUser(
            @PathVariable UUID id,
            @Valid @RequestBody LinkUserRequest request) {
        return ResponseEntity.ok(ApiResponse.success(memberService.linkUserAccount(id, request)));
    }

    @PostMapping("/{id}/app-access-request")
    @PreAuthorize("hasAnyAuthority('ROLE_ADMIN', 'ROLE_MANAGER')")
    public ResponseEntity<ApiResponse<Map<String, Object>>> requestAppAccess(
            @PathVariable UUID id, Authentication auth) {
        UUID actorId = (UUID) auth.getPrincipal();
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(memberService.requestAppAccess(id, actorId),
                        "Chitfund Request created"));
    }

    @PostMapping("/{id}/grant-app-access/send-otp")
    @PreAuthorize("hasAnyAuthority('ROLE_ADMIN', 'ROLE_MANAGER')")
    public ResponseEntity<ApiResponse<Map<String, Object>>> grantAppAccessSendOtp(
            @PathVariable UUID id) {
        return ResponseEntity.ok(ApiResponse.success(
                memberService.grantAppAccessSendOtp(id), "OTP sent to member's phone"));
    }

    @PostMapping("/{id}/grant-app-access/verify")
    @PreAuthorize("hasAnyAuthority('ROLE_ADMIN', 'ROLE_MANAGER')")
    public ResponseEntity<ApiResponse<Void>> grantAppAccessVerify(
            @PathVariable UUID id,
            @RequestBody Map<String, String> body) {
        String otp = body.get("otp");
        if (otp == null || otp.isBlank()) {
            throw new com.chitfund.common.exception.BusinessException(
                    com.chitfund.common.exception.ErrorCode.VALIDATION_FAILED, "otp is required");
        }
        memberService.grantAppAccessVerify(id, otp);
        return ResponseEntity.ok(ApiResponse.success(null, "App access granted"));
    }

    @PostMapping("/{id}/revoke-app-access")
    @PreAuthorize("hasAnyAuthority('ROLE_ADMIN', 'ROLE_MANAGER')")
    public ResponseEntity<ApiResponse<Void>> revokeAppAccess(@PathVariable UUID id) {
        memberService.revokeAppAccess(id);
        return ResponseEntity.ok(ApiResponse.success(null, "App access revoked"));
    }

    /**
     * Change member status: ACTIVE ↔ INACTIVE ↔ BLACKLISTED.
     * Blacklisting requires a reason — appended to member notes for audit trail.
     */
    @PatchMapping("/{id}/status")
    @PreAuthorize("hasAuthority('ROLE_ADMIN')")
    public ResponseEntity<ApiResponse<MemberResponse>> updateStatus(
            @PathVariable UUID id,
            @Valid @RequestBody UpdateStatusRequest request,
            Authentication auth) {
        UUID actorId = (UUID) auth.getPrincipal();
        String actorRole = auth.getAuthorities().stream()
                .findFirst().map(authority -> authority.getAuthority()).orElse("ROLE_ADMIN");
        return ResponseEntity.ok(ApiResponse.success(
                memberService.updateStatus(id, request, actorId, actorRole)));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasAuthority('ROLE_ADMIN')")
    public ResponseEntity<ApiResponse<MemberResponse>> deleteMember(
            @PathVariable UUID id,
            Authentication auth) {
        UUID adminId = (UUID) auth.getPrincipal();
        return ResponseEntity.ok(ApiResponse.success(
                memberService.softDelete(id, adminId), "Member deleted"));
    }

    @GetMapping("/deleted")
    @PreAuthorize("hasAuthority('ROLE_ADMIN')")
    public ResponseEntity<ApiResponse<Page<MemberResponse>>> listDeletedMembers(
            @RequestParam(required = false) String search,
            @PageableDefault(size = 20) Pageable pageable) {
        return ResponseEntity.ok(ApiResponse.success(memberService.searchDeleted(search, pageable)));
    }
}
