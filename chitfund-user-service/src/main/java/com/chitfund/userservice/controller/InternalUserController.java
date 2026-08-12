package com.chitfund.userservice.controller;

import com.chitfund.userservice.domain.entity.User;
import com.chitfund.userservice.domain.enums.Role;
import com.chitfund.userservice.repository.UserRepository;
import com.chitfund.userservice.service.AuthService;
import com.chitfund.userservice.service.TenantService;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/internal/users")
@RequiredArgsConstructor
public class InternalUserController {

    private final UserRepository userRepository;
    private final TenantService tenantService;
    private final AuthService authService;
    private final PasswordEncoder passwordEncoder;

    @Value("${app.internal-key}")
    private String internalKey;

    @GetMapping("/{userId}/name")
    public ResponseEntity<Map<String, String>> getUserName(
            @PathVariable UUID userId,
            @RequestHeader(value = "X-Internal-Key", required = false) String key) {
        if (!internalKey.equals(key)) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of());
        return userRepository.findById(userId)
                .map(u -> ResponseEntity.ok(Map.of("name",
                        u.getFullName() != null ? u.getFullName() : u.getUsername())))
                .orElse(ResponseEntity.ok(Map.of("name", "")));
    }

    @GetMapping("/ids-by-role")
    public ResponseEntity<List<String>> getUserIdsByRole(
            @RequestParam String role,
            @RequestHeader(value = "X-Internal-Key", required = false) String key) {
        if (!internalKey.equals(key)) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(List.of());
        try {
            Role r = Role.valueOf(role.toUpperCase());
            return ResponseEntity.ok(
                    userRepository.findByRoleInAndDeletedAtIsNull(List.of(r))
                            .stream().map(u -> u.getId().toString()).toList());
        } catch (IllegalArgumentException e) {
            return ResponseEntity.ok(List.of());
        }
    }

    /**
     * Called by member-service when a new member is created.
     * Phone exists → create membership + return existing userId + generate setup token.
     * Phone new → create user + membership + return userId + setupToken.
     *
     * Request body: { tenantId, memberId, phone, phoneCountryCode, fullName, email? }
     * Response: { userId, setupToken? } — setupToken only when a new user was created
     */
    @PostMapping("/link-or-create")
    public ResponseEntity<Map<String, String>> linkOrCreate(
            @RequestHeader(value = "X-Internal-Key", required = false) String key,
            @RequestBody Map<String, String> body) {
        if (!internalKey.equals(key)) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of());

        String tenantId = body.get("tenantId");
        String memberId = body.get("memberId");
        String phone    = body.get("phone");
        String cc       = body.getOrDefault("phoneCountryCode", "+91");
        String fullName = body.getOrDefault("fullName", "");
        String email    = body.get("email");

        if (tenantId == null || memberId == null || phone == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "tenantId, memberId, phone are required"));
        }

        UUID tenantUUID = UUID.fromString(tenantId);
        UUID memberUUID = UUID.fromString(memberId);

        // Look for existing user with this phone in this tenant as MEMBER
        List<User> existingUsers = userRepository.findByPhoneAndPhoneCountryCodeAndDeletedAtIsNull(phone, cc);
        User user = existingUsers.stream()
                .filter(u -> u.getRole() == Role.MEMBER || u.getRole() == Role.ADMIN || u.getRole() == Role.MANAGER || u.getRole() == Role.STAFF)
                .findFirst().orElse(null);

        boolean isNewUser = (user == null);

        if (isNewUser) {
            // Create a new user account (no password yet — will be set via setup link)
            String username = generateUsername(phone, cc);
            user = User.builder()
                    .username(username)
                    .fullName(fullName)
                    .phone(phone)
                    .phoneCountryCode(cc)
                    .email((email != null && !email.isBlank()) ? email : null)
                    .passwordHash(passwordEncoder.encode(UUID.randomUUID().toString()))
                    .role(Role.MEMBER)
                    .mustChangePassword(true)
                    .build();
            userRepository.save(user);
        }

        // Create membership in this tenant (idempotent)
        tenantService.addUserToTenant(user.getId(), tenantUUID, Role.MEMBER, memberUUID);
        // Update memberId if membership already existed (link the member record)
        tenantService.updateMemberId(user.getId(), tenantUUID, memberUUID);

        Map<String, String> response;
        if (isNewUser) {
            String setupToken = authService.generateSetupToken(user.getId());
            response = Map.of("userId", user.getId().toString(), "setupToken", setupToken, "isNew", "true");
        } else {
            response = Map.of("userId", user.getId().toString(), "isNew", "false");
        }
        return ResponseEntity.ok(response);
    }

    /**
     * Generates a fresh setup token for an existing user (used by admin to resend setup link).
     */
    @PostMapping("/{userId}/setup-token")
    public ResponseEntity<Map<String, String>> generateSetupToken(
            @PathVariable UUID userId,
            @RequestHeader(value = "X-Internal-Key", required = false) String key) {
        if (!internalKey.equals(key)) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of());
        return userRepository.findById(userId)
                .map(u -> {
                    String token = authService.generateSetupToken(u.getId());
                    return ResponseEntity.ok(Map.of("setupToken", token, "userId", userId.toString()));
                })
                .orElse(ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "User not found")));
    }

    private String generateUsername(String phone, String countryCode) {
        String base = "m" + phone.replaceAll("[^0-9]", "");
        if (base.length() > 45) base = base.substring(0, 45);
        String candidate = base;
        int suffix = 1;
        while (userRepository.existsByUsername(candidate)) {
            candidate = base + suffix++;
        }
        return candidate;
    }
}
