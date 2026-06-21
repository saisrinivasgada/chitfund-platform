package com.chitfund.payoutservice.dto.response;

import com.chitfund.payoutservice.domain.enums.DisbursementMode;
import com.chitfund.payoutservice.domain.enums.PayoutStatus;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

@Data
@Builder
public class PayoutResponse {

    private UUID id;
    private UUID chitId;
    private UUID memberId;
    private int monthNumber;

    private BigDecimal winningAmount;
    private BigDecimal discountAmount;
    private BigDecimal netPayoutAmount;
    private BigDecimal disbursedAmount;
    private BigDecimal remainingAmount;

    private PayoutStatus status;
    private DisbursementMode disbursementMode;
    private String referenceNumber;
    private String notes;

    private UUID createdBy;
    private LocalDateTime createdAt;

    private LocalDateTime disbursedAt;
    private UUID disbursedBy;

    private LocalDateTime cancelledAt;
    private UUID cancelledBy;
    private String cancellationReason;

    private LocalDateTime updatedAt;
}
