package com.chitfund.chitservice.dto.request;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

@Data
public class ReservationSlotRequest {

    // Actual calendar month (stored as first-of-month: 2027-01-01 for Jan 2027)
    @NotNull(message = "Reservation month is required")
    private LocalDate reservationMonth;

    // Optional: if set, the slot is created at this exact ordinal position
    // (used when filling a voided slot at its original monthNumber).
    // If omitted, the backend assigns max(monthNumber)+1 automatically.
    private Integer monthNumber;

    // null = unallocated; admin assigns later
    private UUID memberId;

    // null = not yet decided; admin fills it in later via the Schedule tab
    @DecimalMin(value = "0.01")
    private BigDecimal payoutAmount;

    // Overrides chit's defaultPostPayoutContribution for this slot only
    private BigDecimal postPayoutContribution;

    private String notes;
}
