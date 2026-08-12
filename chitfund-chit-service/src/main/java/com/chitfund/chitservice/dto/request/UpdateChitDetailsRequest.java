package com.chitfund.chitservice.dto.request;

import jakarta.validation.constraints.*;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;

@Data
public class UpdateChitDetailsRequest {

    @Size(max = 100)
    private String name;

    private String description;

    @DecimalMin(value = "1000.00", message = "Minimum chit value is ₹1,000")
    private BigDecimal chitValue;

    @DecimalMin(value = "1.00")
    private BigDecimal installmentAmount;

    @Min(value = 2, message = "A chit needs at least 2 members")
    @Max(value = 100, message = "Maximum 100 members per chit")
    private Integer numberOfMembers;

    @Min(value = 2, message = "Minimum 2 months")
    @Max(value = 120, message = "Maximum 120 months")
    private Integer numberOfMonths;

    @Min(value = 1) @Max(value = 28)
    private Integer monthlyDueDate;

    @Min(0)
    private Integer orgHeldSpotsCount;

    private LocalDate startDate;

    private Boolean postPayoutContributionEnabled;

    @DecimalMin(value = "0.00")
    private BigDecimal defaultPostPayoutContribution;
}
