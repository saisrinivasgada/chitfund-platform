package com.chitfund.chitservice.dto.response;

import com.chitfund.chitservice.domain.enums.ReservationStatus;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.UUID;

@Data
@Builder
public class MonthReservationResponse {
    private UUID id;
    private UUID chitId;
    private UUID memberId;
    private Integer monthNumber;
    private LocalDate reservationMonth;    // actual calendar month
    private BigDecimal payoutAmount;
    private BigDecimal postPayoutContribution;
    private ReservationStatus status;
    private String voidReason;
    private LocalDateTime voidedAt;
    private UUID createdBy;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    private UUID updatedBy;
}
