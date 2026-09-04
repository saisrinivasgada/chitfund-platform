package com.chitfund.userservice.dto.response;

import lombok.Builder;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.UUID;

@Data
@Builder
public class ContactRequestMessageResponse {
    private UUID id;
    private UUID contactRequestId;
    private String senderType;
    private String senderName;
    private String content;
    private LocalDateTime createdAt;
}
