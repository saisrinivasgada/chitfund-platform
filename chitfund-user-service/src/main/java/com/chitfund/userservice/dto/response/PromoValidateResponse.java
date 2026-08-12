package com.chitfund.userservice.dto.response;

import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;

@Data
@Builder
public class PromoValidateResponse {
    private boolean valid;
    private String promoType;       // STANDARD | REFERRAL
    private String label;
    private String description;
    private BigDecimal discountPct;
    private String referralOrgName; // set when promoType=REFERRAL
    private String errorMessage;    // set when valid=false
}
