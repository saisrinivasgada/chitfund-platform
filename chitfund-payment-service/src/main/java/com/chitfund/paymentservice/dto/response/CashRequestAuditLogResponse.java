package com.chitfund.paymentservice.dto.response;

import lombok.Builder;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.UUID;

@Data
@Builder
public class CashRequestAuditLogResponse {
    private UUID id;
    private UUID requestId;
    private String action;
    private String fromStatus;
    private String toStatus;
    private UUID performedBy;
    private String performedByRole;
    private String reason;
    private LocalDateTime performedAt;
}
