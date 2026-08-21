package com.chitfund.userservice.dto.response;

import lombok.Builder;
import lombok.Data;

import java.time.LocalDate;

@Data
@Builder
public class UpgradePreviewResponse {

    private String currentPlan;
    private String currentPlanName;
    private long   currentPlanPricePaise;

    private String newPlan;
    private String newPlanName;
    private long   newPlanPricePaise;

    private LocalDate planPeriodStart;
    private LocalDate planPeriodEnd;
    private int    daysInPeriod;
    private int    daysUsed;
    private int    daysRemaining;

    private long   creditPaise;     // unused-days refund applied as discount
    private long   chargePaise;     // amount to collect

    private LocalDate newPeriodStart;
    private LocalDate newPeriodEnd;

    /** true if the current plan is already expired — no credit applies */
    private boolean planExpired;

    /** true when switching to a lower-priced plan */
    private boolean downgrade;

    /** paise to return to credit balance when credit exceeds new plan cost (downgrade only) */
    private long creditToReturnPaise;
}
