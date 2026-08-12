package com.chitfund.userservice.dto.response;

import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;

@Data
@Builder
public class TenantDiscountResponse {
    private String tenantId;
    private String discountType;
    private BigDecimal discountValue;
    private String reason;
    private String expiresAt;
}
