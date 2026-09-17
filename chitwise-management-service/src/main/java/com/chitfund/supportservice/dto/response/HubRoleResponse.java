package com.chitfund.supportservice.dto.response;

import lombok.Builder;
import lombok.Data;

import java.time.Instant;
import java.util.Set;

@Data
@Builder
public class HubRoleResponse {
    private String id;
    private String name;
    private String description;
    private Set<String> permissions;
    private long employeeCount;
    private Instant createdAt;
    private Instant updatedAt;
}
