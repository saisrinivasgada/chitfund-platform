package com.chitfund.userservice.dto.response;

import lombok.Builder;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.UUID;

@Data
@Builder
public class ContactRequestResponse {
    private UUID id;
    private String type;
    private String name;
    private String email;
    private String phone;
    private String subject;
    private String message;
    private UUID tenantId;
    private String tenantName;
    private String status;
    private String preferredContact;
    private LocalDateTime holdUntil;
    private LocalDateTime createdAt;
}
