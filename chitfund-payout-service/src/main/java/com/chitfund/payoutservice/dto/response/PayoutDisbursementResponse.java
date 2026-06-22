package com.chitfund.payoutservice.dto.response;

import com.chitfund.payoutservice.domain.enums.DisbursementMode;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

@Data
@Builder
public class PayoutDisbursementResponse {
    private UUID id;
    private BigDecimal amount;
    private DisbursementMode mode;
    private String referenceNumber;
    private String notes;
    private UUID disbursedBy;
    private LocalDateTime disbursedAt;
}
