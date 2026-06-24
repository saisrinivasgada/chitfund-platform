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

import java.util.UUID;

@RestController
@RequestMapping("/members")
@RequiredArgsConstructor
public class MemberController {

    private final MemberService memberService;

    /**
     * Create a member profile. Admin-only.
     * Phone must be unique — it's the field workers use to identify members in the field.
     */
    @PostMapping
    @PreAuthorize("hasRole('ROLE_ADMIN')")
    public ResponseEntity<ApiResponse<MemberResponse>> createMember(
            @Valid @RequestBody CreateMemberRequest request,
            Authentication auth) {
        UUID adminId = (UUID) auth.getPrincipal();
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(memberService.createMember(request, adminId)));
    }

    /**
     * Paginated member list with optional search (name or phone) and status filter.
     * Example: GET /members?search=ravi&status=ACTIVE&page=0&size=20
     */
    @GetMapping
    @PreAuthorize("hasAnyRole('ROLE_ADMIN', 'ROLE_MANAGER', 'ROLE_WORKER')")
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
    @PreAuthorize("hasAnyRole('ROLE_ADMIN', 'ROLE_MANAGER', 'ROLE_WORKER')")
    public ResponseEntity<ApiResponse<MemberResponse>> getMember(@PathVariable UUID id) {
        return ResponseEntity.ok(ApiResponse.success(memberService.getById(id)));
    }

    /**
     * Lookup by phone — fastest way for a worker to identify a member during cash collection.
     * Worker types the member's number, gets their profile + outstanding balance (from payment-service).
     */
    @GetMapping("/by-phone/{phone}")
    @PreAuthorize("hasAnyRole('ROLE_ADMIN', 'ROLE_MANAGER', 'ROLE_WORKER')")
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
    @PreAuthorize("hasRole('ROLE_MEMBER')")
    public ResponseEntity<ApiResponse<MemberResponse>> getMyProfile(Authentication auth) {
        UUID userId = (UUID) auth.getPrincipal();
        return ResponseEntity.ok(ApiResponse.success(memberService.getByUserId(userId)));
    }

    /**
     * Admin updates member info (name, email, address, KYC, bank details).
     * Phone is NOT updatable here — it's unique and used as a field identifier.
     */
    @PutMapping("/{id}")
    @PreAuthorize("hasRole('ROLE_ADMIN')")
    public ResponseEntity<ApiResponse<MemberResponse>> updateMember(
            @PathVariable UUID id,
            @Valid @RequestBody UpdateMemberRequest request) {
        return ResponseEntity.ok(ApiResponse.success(memberService.updateMember(id, request)));
    }

    /**
     * Member updates their own contact info (phone, email, address, city).
     * Deliberately excludes name, KYC, and bank — those are admin-controlled.
     */
    @PatchMapping("/me/profile")
    @PreAuthorize("hasRole('ROLE_MEMBER')")
    public ResponseEntity<ApiResponse<MemberResponse>> updateMyProfile(
            @Valid @RequestBody UpdateMemberProfileRequest request,
            Authentication auth) {
        UUID userId = (UUID) auth.getPrincipal();
        return ResponseEntity.ok(ApiResponse.success(memberService.updateMyProfile(userId, request)));
    }

    /**
     * Links an existing user account (from user-service) to this member.
     * Admin creates a login via POST /api/auth/register, then calls this with the returned userId.
     * Lets the member log in and see their own chits, payments, and payouts.
     */
    @PatchMapping("/{id}/link-user")
    @PreAuthorize("hasRole('ROLE_ADMIN')")
    public ResponseEntity<ApiResponse<MemberResponse>> linkUser(
            @PathVariable UUID id,
            @Valid @RequestBody LinkUserRequest request) {
        return ResponseEntity.ok(ApiResponse.success(memberService.linkUserAccount(id, request)));
    }

    /**
     * Change member status: ACTIVE ↔ INACTIVE ↔ BLACKLISTED.
     * Blacklisting requires a reason — appended to member notes for audit trail.
     */
    @PatchMapping("/{id}/status")
    @PreAuthorize("hasRole('ROLE_ADMIN')")
    public ResponseEntity<ApiResponse<MemberResponse>> updateStatus(
            @PathVariable UUID id,
            @Valid @RequestBody UpdateStatusRequest request) {
        return ResponseEntity.ok(ApiResponse.success(memberService.updateStatus(id, request)));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ROLE_ADMIN')")
    public ResponseEntity<ApiResponse<MemberResponse>> deleteMember(
            @PathVariable UUID id,
            Authentication auth) {
        UUID adminId = (UUID) auth.getPrincipal();
        return ResponseEntity.ok(ApiResponse.success(
                memberService.softDelete(id, adminId), "Member deleted"));
    }

    @GetMapping("/deleted")
    @PreAuthorize("hasRole('ROLE_ADMIN')")
    public ResponseEntity<ApiResponse<Page<MemberResponse>>> listDeletedMembers(
            @RequestParam(required = false) String search,
            @PageableDefault(size = 20) Pageable pageable) {
        return ResponseEntity.ok(ApiResponse.success(memberService.searchDeleted(search, pageable)));
    }
}
