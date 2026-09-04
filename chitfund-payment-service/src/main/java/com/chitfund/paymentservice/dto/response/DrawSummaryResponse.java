package com.chitfund.paymentservice.dto.response;

import com.chitfund.paymentservice.domain.enums.DrawStatus;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.UUID;

@Data
@Builder
public class DrawSummaryResponse {

    private UUID id;
    private UUID chitId;
    private int monthNumber;
    private LocalDate dueDate;
    private BigDecimal installmentAmount;
    private int capacity;
    private DrawStatus status;

    // Payment progress breakdown
    private int settledCount;
    private int partiallyPaidCount;
    private int outstandingCount;
    private int waivedCount;
    private BigDecimal totalCollected;
    private BigDecimal totalOutstanding;

    // Set only when SKIPPED
    private String skipReason;

    private LocalDateTime openedAt;
    private UUID openedBy;
    private LocalDateTime closedAt;
    private UUID closedBy;
    private LocalDateTime skippedAt;
    private UUID skippedBy;
}
