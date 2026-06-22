package com.chitfund.userservice.controller;

import com.chitfund.common.dto.ApiResponse;
import com.chitfund.userservice.domain.entity.User;
import com.chitfund.userservice.domain.enums.Role;
import com.chitfund.userservice.repository.UserRepository;
import lombok.Builder;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Serves GET /members — used by the frontend to populate member dropdowns,
 * winner name lookups, and the members list page.
 *
 * WHY here instead of member-service?
 * Member profiles (KYC, bank details) live in chitfund-member-service which
 * isn't deployed yet. For now the frontend only needs id, name, phone, status —
 * all of which are available from User (role=MEMBER) in this service.
 * When member-service is deployed, point MEMBER_SERVICE_URL back to it.
 */
@RestController
@RequestMapping("/members")
@RequiredArgsConstructor
public class MemberListController {

    private final UserRepository userRepository;

    @Data
    @Builder
    public static class MemberListItem {
        private UUID id;
        private String fullName;
        private String name;
        private String phone;
        private String email;
        private String status;  // "ACTIVE" | "INACTIVE" — matches frontend filter
    }

    @GetMapping
    public ResponseEntity<ApiResponse<List<MemberListItem>>> listMembers(
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String status) {

        List<User> members = userRepository.findByRoleInAndDeletedAtIsNull(List.of(Role.MEMBER));

        List<MemberListItem> result = members.stream()
                .filter(u -> search == null || search.isBlank()
                        || (u.getFullName() != null && u.getFullName().toLowerCase().contains(search.toLowerCase()))
                        || (u.getPhone() != null && u.getPhone().contains(search)))
                .filter(u -> status == null || status.isBlank()
                        || (status.equalsIgnoreCase("ACTIVE") && u.isEnabled())
                        || (status.equalsIgnoreCase("INACTIVE") && !u.isEnabled()))
                .map(u -> MemberListItem.builder()
                        .id(u.getId())
                        .fullName(u.getFullName())
                        .name(u.getFullName())
                        .phone(u.getPhone())
                        .email(u.getEmail())
                        .status(u.isEnabled() ? "ACTIVE" : "INACTIVE")
                        .build())
                .collect(Collectors.toList());

        return ResponseEntity.ok(ApiResponse.success(result));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<MemberListItem>> getMember(@PathVariable UUID id) {
        return userRepository.findById(id)
                .filter(u -> u.getRole() == Role.MEMBER && u.getDeletedAt() == null)
                .map(u -> MemberListItem.builder()
                        .id(u.getId())
                        .fullName(u.getFullName())
                        .name(u.getFullName())
                        .phone(u.getPhone())
                        .email(u.getEmail())
                        .status(u.isEnabled() ? "ACTIVE" : "INACTIVE")
                        .build())
                .map(m -> ResponseEntity.ok(ApiResponse.success(m)))
                .orElse(ResponseEntity.notFound().build());
    }
}
