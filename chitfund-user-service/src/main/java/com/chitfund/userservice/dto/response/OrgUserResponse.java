package com.chitfund.userservice.dto.response;

import lombok.Builder;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@Builder
public class OrgUserResponse {
    private String userId;
    private String membershipId;
    private String username;
    private String fullName;
    private String email;
    private String phone;
    private String role;
    private String memberId;
    private boolean enabled;
    private boolean locked;
    private boolean mustChangePassword;
    private LocalDateTime joinedAt;
    private LocalDateTime lastLoginAt;
    private String tempPassword;
}
