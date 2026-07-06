package com.chitfund.userservice.controller;

import com.chitfund.common.dto.ApiResponse;
import com.chitfund.common.exception.BusinessException;
import com.chitfund.common.exception.ErrorCode;
import com.chitfund.userservice.domain.entity.User;
import com.chitfund.userservice.domain.enums.Role;
import com.chitfund.userservice.repository.UserRepository;
import lombok.Builder;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/members")
@RequiredArgsConstructor
public class MemberListController {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    // ── Response DTO ──────────────────────────────────────────────────────────

    @Data
    @Builder
    public static class MemberListItem {
        private UUID id;
        private UUID userId;
        private String fullName;
        private String name;
        private String phone;
        private String phoneCountryCode;
        private String email;
        private String city;
        private String address;
        private String aadhaarLast4;
        private String panNumber;
        private String notes;
        private UUID referredById;
        private String status;
        private LocalDateTime deletedAt;
        private LocalDateTime createdAt;
    }

    // ── GET /members ──────────────────────────────────────────────────────────

    @GetMapping
    public ResponseEntity<ApiResponse<List<MemberListItem>>> listMembers(
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String status,
            @RequestParam(required = false, defaultValue = "500") int size) {

        List<User> members = userRepository.findByRoleInAndDeletedAtIsNull(List.of(Role.MEMBER));

        List<MemberListItem> result = members.stream()
                .filter(u -> search == null || search.isBlank()
                        || (u.getFullName() != null && u.getFullName().toLowerCase().contains(search.toLowerCase()))
                        || (u.getPhone() != null && u.getPhone().contains(search)))
                .filter(u -> status == null || status.isBlank()
                        || (status.equalsIgnoreCase("ACTIVE") && u.isEnabled())
                        || (status.equalsIgnoreCase("INACTIVE") && !u.isEnabled()))
                .map(this::toListItem)
                .collect(Collectors.toList());

        return ResponseEntity.ok(ApiResponse.success(result));
    }

    // ── GET /members/deleted ──────────────────────────────────────────────────

    @GetMapping("/deleted")
    @PreAuthorize("hasAuthority('ADMIN')")
    public ResponseEntity<ApiResponse<Map<String, Object>>> listDeleted(
            @RequestParam(required = false) String search,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "100") int size) {

        List<User> deleted = userRepository.findByRoleInAndDeletedAtIsNotNull(List.of(Role.MEMBER));

        List<MemberListItem> content = deleted.stream()
                .filter(u -> search == null || search.isBlank()
                        || (u.getFullName() != null && u.getFullName().toLowerCase().contains(search.toLowerCase()))
                        || (u.getPhone() != null && u.getPhone().contains(search)))
                .map(this::toListItem)
                .collect(Collectors.toList());

        Map<String, Object> paged = new LinkedHashMap<>();
        paged.put("content", content);
        paged.put("totalElements", content.size());
        paged.put("page", page);
        paged.put("size", size);

        return ResponseEntity.ok(ApiResponse.success(paged));
    }

    // ── GET /members/{id} ─────────────────────────────────────────────────────

    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<MemberListItem>> getMember(@PathVariable UUID id) {
        return userRepository.findById(id)
                .filter(u -> u.getRole() == Role.MEMBER)
                .map(u -> ResponseEntity.ok(ApiResponse.success(toListItem(u))))
                .orElse(ResponseEntity.notFound().build());
    }

    // ── POST /members ─────────────────────────────────────────────────────────

    @PostMapping
    @PreAuthorize("hasAnyAuthority('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<MemberListItem>> createMember(
            @RequestBody CreateMemberRequest req) {

        // Validate required field
        if (req.getPhone() == null || req.getPhone().isBlank()) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED, "Phone number is required");
        }

        // Duplicate phone check for MEMBERs
        if (userRepository.existsByPhoneAndRoleInAndDeletedAtIsNull(
                req.getPhone(), List.of(Role.MEMBER))) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    "A member account with this mobile number already exists",
                    org.springframework.http.HttpStatus.CONFLICT);
        }

        // Duplicate email check
        if (req.getEmail() != null && !req.getEmail().isBlank()) {
            if (userRepository.existsByEmail(req.getEmail())) {
                throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                        "An account with this email already exists",
                        org.springframework.http.HttpStatus.CONFLICT);
            }
        }

        // Auto-generate a unique username from phone digits
        String base = "m_" + req.getPhone().replaceAll("[^0-9]", "");
        String username = base;
        int attempt = 1;
        while (userRepository.existsByUsername(username)) {
            username = base + "_" + attempt++;
        }

        // Auto-generate temp password (member must change on first login)
        String tempPassword = generateTempPassword();

        User user = User.builder()
                .username(username)
                .fullName(req.getFullName())
                .phone(req.getPhone())
                .phoneCountryCode(req.getPhoneCountryCode())
                .email(req.getEmail() != null && !req.getEmail().isBlank() ? req.getEmail() : null)
                .city(req.getCity())
                .address(req.getAddress())
                .aadhaarLast4(req.getAadhaarLast4())
                .panNumber(req.getPanNumber())
                .notes(req.getNotes())
                .referredById(req.getReferredById())
                .passwordHash(passwordEncoder.encode(tempPassword))
                .role(Role.MEMBER)
                .mustChangePassword(true)
                .build();

        userRepository.save(user);

        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(toListItem(user), "Member added successfully"));
    }

    // ── PUT /members/{id} ─────────────────────────────────────────────────────

    @PutMapping("/{id}")
    @PreAuthorize("hasAnyAuthority('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<MemberListItem>> updateMember(
            @PathVariable UUID id,
            @RequestBody UpdateMemberRequest req) {

        User user = memberOrThrow(id);

        if (req.getFullName() != null) user.setFullName(req.getFullName());
        if (req.getPhone() != null)    user.setPhone(req.getPhone());
        if (req.getPhoneCountryCode() != null) user.setPhoneCountryCode(req.getPhoneCountryCode());
        if (req.getEmail() != null)    user.setEmail(req.getEmail().isBlank() ? null : req.getEmail());
        if (req.getCity() != null)     user.setCity(req.getCity());
        if (req.getAddress() != null)  user.setAddress(req.getAddress());
        if (req.getAadhaarLast4() != null) user.setAadhaarLast4(req.getAadhaarLast4());
        if (req.getPanNumber() != null)    user.setPanNumber(req.getPanNumber());
        if (req.getNotes() != null)        user.setNotes(req.getNotes());
        if (req.getReferredById() != null) user.setReferredById(req.getReferredById());

        userRepository.save(user);
        return ResponseEntity.ok(ApiResponse.success(toListItem(user)));
    }

    // ── PATCH /members/{id}/status ────────────────────────────────────────────

    @PatchMapping("/{id}/status")
    @PreAuthorize("hasAnyAuthority('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<MemberListItem>> patchStatus(
            @PathVariable UUID id,
            @RequestBody Map<String, String> body) {

        User user = memberOrThrow(id);
        String status = body.get("status");
        user.setEnabled("ACTIVE".equalsIgnoreCase(status));
        userRepository.save(user);
        return ResponseEntity.ok(ApiResponse.success(toListItem(user)));
    }

    // ── DELETE /members/{id} ──────────────────────────────────────────────────

    @DeleteMapping("/{id}")
    @PreAuthorize("hasAuthority('ADMIN')")
    public ResponseEntity<ApiResponse<Void>> deleteMember(
            @PathVariable UUID id,
            Authentication auth) {

        User user = memberOrThrow(id);
        User principal = (User) auth.getPrincipal();
        user.setDeletedAt(LocalDateTime.now());
        user.setDeletedBy(principal.getId());
        user.setEnabled(false);
        userRepository.save(user);
        return ResponseEntity.ok(ApiResponse.success(null, "Member deleted"));
    }

    // ── PATCH /members/{id}/link-user ─────────────────────────────────────────

    @PatchMapping("/{id}/link-user")
    @PreAuthorize("hasAnyAuthority('ADMIN', 'MANAGER')")
    public ResponseEntity<ApiResponse<MemberListItem>> linkUser(
            @PathVariable UUID id,
            @RequestBody LinkUserRequest req) {

        User member = memberOrThrow(id);

        // The mobile calls POST /auth/register first to create a temporary user carrying
        // the admin-chosen username/email. We apply those credentials to the member, then
        // delete the extra user — in user-service, a member IS already a user.
        User appUser = userRepository.findById(req.getUserId())
                .orElse(null);

        if (appUser != null && !appUser.getId().equals(member.getId())) {
            if (appUser.getUsername() != null) member.setUsername(appUser.getUsername());
            if (appUser.getEmail() != null)    member.setEmail(appUser.getEmail());
            userRepository.save(member);
            userRepository.delete(appUser);
        }

        return ResponseEntity.ok(ApiResponse.success(toListItem(member), "App login created"));
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private User memberOrThrow(UUID id) {
        return userRepository.findById(id)
                .filter(u -> u.getRole() == Role.MEMBER && u.getDeletedAt() == null)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Member not found"));
    }

    private MemberListItem toListItem(User u) {
        return MemberListItem.builder()
                .id(u.getId())
                .userId(u.getId())
                .fullName(u.getFullName())
                .name(u.getFullName())
                .phone(u.getPhone())
                .phoneCountryCode(u.getPhoneCountryCode())
                .email(u.getEmail())
                .city(u.getCity())
                .address(u.getAddress())
                .aadhaarLast4(u.getAadhaarLast4())
                .panNumber(u.getPanNumber())
                .notes(u.getNotes())
                .referredById(u.getReferredById())
                .status(u.isEnabled() ? "ACTIVE" : "INACTIVE")
                .deletedAt(u.getDeletedAt())
                .createdAt(u.getCreatedAt())
                .build();
    }

    private String generateTempPassword() {
        String chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
        Random rng = new Random();
        StringBuilder sb = new StringBuilder(10);
        for (int i = 0; i < 10; i++) sb.append(chars.charAt(rng.nextInt(chars.length())));
        return sb.toString();
    }

    // ── Request DTOs ──────────────────────────────────────────────────────────

    @Data
    public static class CreateMemberRequest {
        private String fullName;
        private String phone;
        private String phoneCountryCode;
        private String email;
        private String city;
        private String address;
        private String aadhaarLast4;
        private String panNumber;
        private String notes;
        private UUID referredById;
    }

    @Data
    public static class UpdateMemberRequest {
        private String fullName;
        private String phone;
        private String phoneCountryCode;
        private String email;
        private String city;
        private String address;
        private String aadhaarLast4;
        private String panNumber;
        private String notes;
        private UUID referredById;
    }

    @Data
    public static class LinkUserRequest {
        private UUID userId;
    }
}
