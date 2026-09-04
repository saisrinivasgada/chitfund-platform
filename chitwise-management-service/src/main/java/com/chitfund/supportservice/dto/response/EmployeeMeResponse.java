package com.chitfund.supportservice.dto.response;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.Builder;
import lombok.Getter;

import java.time.Instant;

@Getter
@Builder
@JsonInclude(JsonInclude.Include.NON_NULL)
public class EmployeeMeResponse {
    private String id;
    private String email;
    private String fullName;
    private String username;
    private String role;
    private boolean active;
    private Instant lastLoginAt;
}
