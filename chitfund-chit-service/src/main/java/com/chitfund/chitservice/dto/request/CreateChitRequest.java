package com.chitfund.chitservice.dto.request;

import com.chitfund.chitservice.domain.enums.ChitType;
import com.chitfund.chitservice.domain.enums.WinnerSelectionMode;
import jakarta.validation.constraints.*;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

@Data
public class CreateChitRequest {

    @NotNull(message = "Chit type is required")
    private ChitType chitType;

    @NotBlank(message = "Chit name is required")
    @Size(max = 100)
    private String name;

    private String description;

    // Total monthly pool value (e.g. ₹2,00,000).
    @NotNull(message = "Chit value is required")
    @DecimalMin(value = "1000.00", message = "Minimum chit value is ₹1,000")
    private BigDecimal chitValue;

    // Admin-supplied installment; if null, derived as chitValue / numberOfMembers.
    @DecimalMin(value = "1.00")
    private BigDecimal installmentAmount;

    @NotNull(message = "Number of months is required")
    @Min(value = 2, message = "Minimum 2 months")
    @Max(value = 120, message = "Maximum 120 months")
    private Integer numberOfMonths;

    @NotNull(message = "Number of members is required")
    @Min(value = 2, message = "A chit needs at least 2 members")
    @Max(value = 100, message = "Maximum 100 members per chit")
    private Integer numberOfMembers;

    // Day of month on which installment is due (1–28)
    @Min(value = 1) @Max(value = 28)
    private Integer monthlyDueDate;

    private LocalDate startDate;

    // Admin-held spot count within totalMembers
    @Min(0)
    private Integer adminHeldSpotsCount = 0;

    // Contribution rule
    private boolean postPayoutContributionEnabled = false;

    @DecimalMin(value = "0.00")
    private BigDecimal defaultPostPayoutContribution;

    // Optional winner selection mode (defaults to RESERVATION for RESERVATION type)
    private WinnerSelectionMode winnerSelectionMode;

    // Optional reservation schedule supplied at creation time (can be added later)
    private List<ReservationSlotRequest> reservationSchedule;
}
