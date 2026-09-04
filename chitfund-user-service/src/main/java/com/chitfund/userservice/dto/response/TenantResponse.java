package com.chitfund.userservice.dto.response;

import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
@Builder
public class TenantResponse {
    private String id;
    private String name;
    private String slug;
    private String status;
    private String plan;
    private LocalDateTime planExpiresAt;
    private String requestedPlan;
    private LocalDateTime upgradeRequestedAt;
    private LocalDateTime renewalRequestedAt;
    private String contactPhone;
    private String contactEmail;
    private String supportPhoneNumber;
    private String businessRegNumber;
    private long memberCount;
    private LocalDateTime createdAt;
    private String referralCode;
    private BigDecimal creditBalanceInr;
    private LocalDateTime promoDiscountUntil;
    private LocalDateTime cancellationRequestedAt;
    private String        cancellationRequestedBy;
}
