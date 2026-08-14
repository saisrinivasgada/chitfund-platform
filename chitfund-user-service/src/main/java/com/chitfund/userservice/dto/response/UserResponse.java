package com.chitfund.userservice.dto.response;

import com.chitfund.userservice.domain.enums.Role;
import lombok.Builder;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.UUID;

@Data
@Builder
public class UserResponse {
    private UUID id;
    private String username;
    private String fullName;
    private String phone;
    private String phoneCountryCode;
    private String email;
    private Role role;
    private boolean enabled;
    private boolean locked;
    private int failedLoginAttempts;
    private boolean mustChangePassword;
    private LocalDateTime lastLoginAt;
    private LocalDateTime createdAt;
    private LocalDateTime deletedAt;
    private UUID deletedBy;
    private UUID createdBy;
    private UUID updatedBy;
    // passwordHash intentionally excluded — never expose it
}
