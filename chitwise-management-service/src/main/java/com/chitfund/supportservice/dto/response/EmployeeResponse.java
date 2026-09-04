package com.chitfund.supportservice.dto.response;

import lombok.Builder;
import lombok.Data;

import java.time.Instant;

@Data
@Builder
public class EmployeeResponse {
    private String id;
    private String employeeId;   // CW-0001 format, for ID cards
    private String fullName;
    private String email;
    private String username;
    private String role;
    private boolean active;
    private Instant lastLoginAt;
    private Instant createdAt;
    private boolean invitePending;
}
