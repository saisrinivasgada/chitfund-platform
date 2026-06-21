package com.chitfund.chitservice.dto.response;

import com.chitfund.chitservice.domain.enums.WinnerSelectionMode;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

@Data
@Builder
public class MonthlyWinnerResponse {
    private UUID id;
    private UUID chitId;
    private UUID memberId;
    private Integer monthNumber;
    private WinnerSelectionMode selectionMode;
    private BigDecimal winningAmount;
    private BigDecimal discountAmount;
    private LocalDateTime assignedAt;
    private UUID assignedBy;
}
