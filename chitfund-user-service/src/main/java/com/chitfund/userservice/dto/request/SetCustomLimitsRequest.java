package com.chitfund.userservice.dto.request;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.PositiveOrZero;
import lombok.Data;

import java.util.List;

@Data
public class SetCustomLimitsRequest {
    @Min(-1)
    private int maxActiveChits;   // -1 = unlimited

    @Min(-1)
    private int maxMembers;       // -1 = unlimited

    @Min(-1)
    private int maxStaff;         // -1 = unlimited

    private List<String> enabledCapabilities;

    @NotBlank
    private String allowedChitTypes; // comma-separated: RESERVATION,LOTTERY,AUCTION

    @PositiveOrZero
    private long priceMonthlyInr; // in paise

    private String notes;
}
