package com.chitfund.userservice.controller;

import com.chitfund.userservice.domain.enums.Role;
import com.chitfund.userservice.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/internal/users")
@RequiredArgsConstructor
public class InternalUserController {

    private final UserRepository userRepository;

    @Value("${app.internal-key}")
    private String internalKey;

    @GetMapping("/{userId}/name")
    public ResponseEntity<Map<String, String>> getUserName(
            @PathVariable UUID userId,
            @RequestHeader(value = "X-Internal-Key", required = false) String key) {
        if (!internalKey.equals(key)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of());
        }
        return userRepository.findById(userId)
                .map(u -> ResponseEntity.ok(Map.of("name", u.getFullName() != null ? u.getFullName() : u.getUsername())))
                .orElse(ResponseEntity.ok(Map.of("name", "")));
    }

    /**
     * Returns user IDs for all active users in the given role.
     * Used by notification-service to fan out in-app notifications to all admins/managers.
     */
    @GetMapping("/ids-by-role")
    public ResponseEntity<List<String>> getUserIdsByRole(
            @RequestParam String role,
            @RequestHeader(value = "X-Internal-Key", required = false) String key) {
        if (!internalKey.equals(key)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(List.of());
        }
        try {
            Role r = Role.valueOf(role.toUpperCase());
            List<String> ids = userRepository.findByRoleInAndDeletedAtIsNull(List.of(r))
                    .stream().map(u -> u.getId().toString()).toList();
            return ResponseEntity.ok(ids);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.ok(List.of());
        }
    }
}
