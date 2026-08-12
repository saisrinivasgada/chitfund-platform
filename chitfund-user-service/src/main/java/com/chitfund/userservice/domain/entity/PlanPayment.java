package com.chitfund.userservice.domain.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(name = "plan_payments")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PlanPayment {

    @Id
    private String id;

    @Column(nullable = false, length = 36)
    private String tenantId;

    @Column(nullable = false, length = 20)
    private String type;      // PURCHASE | RENEWAL | UPGRADE | REFUND

    @Column(nullable = false, length = 20)
    @Builder.Default
    private String status = "COMPLETED";  // COMPLETED | REFUNDED

    @Column(nullable = false)
    private long amountPaise;

    @Column(nullable = false, length = 20)
    private String toPlan;

    @Column(nullable = false, length = 100)
    private String toPlanName;

    @Column(length = 20)
    private String fromPlan;

    @Column(length = 100)
    private String fromPlanName;

    private Long prorationCreditPaise;
    private Long fullPlanPricePaise;
    private Integer daysRemaining;
    private Integer daysInPeriod;

    @Column(nullable = false)
    private LocalDate planPeriodStart;

    @Column(nullable = false)
    private LocalDate planPeriodEnd;

    @Column(nullable = false, length = 20)
    private String paymentMethod;  // UPI | CASH | BANK_TRANSFER

    @Column(length = 255)
    private String paymentReference;

    @Column(nullable = false)
    private LocalDate paymentDate;

    private Long refundAmountPaise;

    @Column(columnDefinition = "text")
    private String refundReason;

    @Column(length = 20)
    private String refundMethod;

    @Column(length = 255)
    private String refundReference;

    private LocalDateTime refundedAt;

    @Column(length = 36)
    private String refundedBy;

    @Column(columnDefinition = "text")
    private String notes;

    /** Account credit (not proration) applied to reduce gross amount */
    @Builder.Default
    private long accountCreditAppliedPaise = 0L;

    /** Gross plan price before account credit deduction */
    @Builder.Default
    private long grossAmountPaise = 0L;

    @Column(length = 255, unique = true)
    private String idempotencyKey;

    @Column(nullable = false, length = 36)
    private String createdBy;

    @Column(nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(nullable = false)
    private LocalDateTime updatedAt;

    @PrePersist
    void prePersist() { createdAt = updatedAt = LocalDateTime.now(); }

    @PreUpdate
    void preUpdate() { updatedAt = LocalDateTime.now(); }
}
