package com.chitfund.chitservice.dto.response;

import lombok.Builder;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.UUID;

@Data
@Builder
public class ChitEnrollmentResponse {
    private UUID id;
    private UUID chitId;
    private UUID memberId;
    private LocalDateTime enrolledAt;
    private boolean active;
}
