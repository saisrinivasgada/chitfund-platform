package com.chitfund.userservice.dto.response;

import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
@Builder
public class BillingInfoResponse {

    private String plan;                    // BASIC, GROWTH, ENTERPRISE, CUSTOM
    private String planLabel;              // human-readable: "Basic", "Growth", etc.
    private BigDecimal priceMonthlyInr;    // base plan price per month
    private BigDecimal appliedDiscountPct; // 0 if no active promo
    private BigDecimal effectivePriceInr;  // priceMonthlyInr * (1 - discountPct/100)
    private String promoLabel;             // null if no promo
    private String discountDurationType;   // ONCE | MONTHS | FOREVER | null
    private LocalDateTime promoDiscountUntil; // null = forever
    private BigDecimal creditBalanceInr;   // accumulated referral/manual credits
    private BigDecimal nextBillingEstimate; // effectivePriceInr - min(credit, effectivePriceInr)
    private String referralCode;
    private LocalDateTime planExpiresAt;
}
