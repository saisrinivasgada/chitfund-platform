package com.chitfund.userservice.dto.request;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
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
    private String allowedChitTypes; // comma-separated: STANDARD,POST_PAYOUT,RESERVATION,FLEXI

    private long priceMonthlyInr; // in paise

    private String notes;
}
