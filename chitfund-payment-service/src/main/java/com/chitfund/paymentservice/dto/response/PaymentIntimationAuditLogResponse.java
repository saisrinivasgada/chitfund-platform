package com.chitfund.paymentservice.dto.response;

import com.chitfund.paymentservice.domain.PaymentIntimationAuditLog;
import lombok.Builder;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.UUID;

@Data
@Builder
public class PaymentIntimationAuditLogResponse {
    private UUID id;
    private String intimationId;
    private String action;
    private String fromStatus;
    private String toStatus;
    private String performedBy;
    private String performedByRole;
    private String reason;
    private LocalDateTime performedAt;

    public static PaymentIntimationAuditLogResponse from(PaymentIntimationAuditLog log) {
        return PaymentIntimationAuditLogResponse.builder()
                .id(log.getId())
                .intimationId(log.getIntimationId())
                .action(log.getAction())
                .fromStatus(log.getFromStatus())
                .toStatus(log.getToStatus())
                .performedBy(log.getPerformedBy())
                .performedByRole(log.getPerformedByRole())
                .reason(log.getReason())
                .performedAt(log.getPerformedAt())
                .build();
    }
}
