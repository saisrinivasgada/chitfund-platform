package com.chitfund.userservice.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TenantInfo {
    private String tenantId;
    private String name;
    private String slug;
    private String plan;
    private String status;         // ACTIVE / SUSPENDED / PENDING
    private LocalDateTime planExpiresAt;
    private String role;           // role in THIS tenant (ADMIN, MEMBER, etc.)
    private String memberId;       // null if not a MEMBER role
    private boolean analyticsEnabled;
}
