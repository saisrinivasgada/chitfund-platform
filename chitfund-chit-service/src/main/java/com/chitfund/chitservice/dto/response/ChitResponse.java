package com.chitfund.chitservice.dto.response;

import com.chitfund.chitservice.domain.enums.ChitStatus;
import com.chitfund.chitservice.domain.enums.ChitType;
import com.chitfund.chitservice.domain.enums.WinnerSelectionMode;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Map;
import java.util.UUID;

@Data
@Builder
public class ChitResponse {
    private UUID id;
    private ChitType chitType;
    private String name;
    private String description;

    private BigDecimal chitValue;
    private BigDecimal installmentAmount;
    private BigDecimal totalAmount;       // = chitValue (backward compat)

    private Integer totalMembers;
    private Integer durationMonths;
    private Integer monthlyDueDate;

    private WinnerSelectionMode winnerSelectionMode;
    private ChitStatus status;

    private boolean postPayoutContributionEnabled;
    private BigDecimal defaultPostPayoutContribution;
    private Integer orgHeldSpotsCount;

    private LocalDate startDate;
    private LocalDate endDate;

    private LocalDateTime pausedAt;
    private Integer totalPausedMonths;

    private LocalDateTime deletedAt;
    private UUID deletedBy;

    private Map<String, Object> attributes;

    private UUID createdBy;
    private UUID updatedBy;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    // Enriched at query time — not stored in the row
    private long enrolledCount;
    private long winnersAssigned;
}
