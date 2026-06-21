package com.chitfund.paymentservice.dto.response;

import com.chitfund.paymentservice.domain.enums.CashRequestStatus;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

@Data
@Builder
public class CashRequestResponse {

    private UUID id;
    private UUID memberId;
    private UUID chitId;
    private BigDecimal requestedAmount;
    private CashRequestStatus status;

    private UUID assignedWorkerId;
    private LocalDateTime assignedAt;
    private UUID assignedBy;

    private String notes;
    private String adminNotes;

    private UUID collectedBatchId;
    private LocalDateTime requestedAt;
    private LocalDateTime updatedAt;
}
