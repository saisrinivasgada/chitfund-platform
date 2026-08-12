package com.chitfund.userservice.dto.response;

import lombok.Builder;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

@Data
@Builder
public class PaymentResponse {

    private String id;
    private String tenantId;
    private String tenantName;

    private String type;    // PURCHASE | RENEWAL | UPGRADE | REFUND
    private String status;  // COMPLETED | REFUNDED

    private long amountPaise;               // net collected (after account credit)
    private long grossAmountPaise;          // plan price before account credit
    private long accountCreditAppliedPaise; // account credit deducted

    private String toPlan;
    private String toPlanName;
    private String fromPlan;
    private String fromPlanName;

    // proration (only for UPGRADE)
    private Long   prorationCreditPaise;
    private Long   fullPlanPricePaise;
    private Integer daysRemaining;
    private Integer daysInPeriod;

    private LocalDate planPeriodStart;
    private LocalDate planPeriodEnd;

    private String paymentMethod;
    private String paymentReference;
    private LocalDate paymentDate;

    // refund info
    private Long   refundAmountPaise;
    private String refundReason;
    private String refundMethod;
    private String refundReference;
    private LocalDateTime refundedAt;

    private String notes;
    private String createdBy;
    private LocalDateTime createdAt;

    private List<ReceiptResponse> receipts;
}
