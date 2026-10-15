package com.chitfund.paymentservice.dto.response;

import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;

@Data
@Builder
public class IntimationItemResponse {
    private String id;
    private String chitId;
    private String chitName;
    private BigDecimal claimedAmount;
    private BigDecimal approvedAmount;
    private String paymentBatchId;
}
