package com.chitfund.payoutservice.domain;

import com.chitfund.payoutservice.domain.enums.DisbursementMode;
import com.chitfund.payoutservice.domain.enums.PayoutStatus;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "payouts")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Payout {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "tenant_id", nullable = false, columnDefinition = "varchar(36)")
    private String tenantId;

    @Column(nullable = false)
    private UUID chitId;

    @Column(nullable = false)
    private UUID memberId;

    @Column(nullable = false)
    private int monthNumber;

    // What the chit collected from all members for this month
    @Column(nullable = false, precision = 15, scale = 2)
    private BigDecimal winningAmount;

    // Total deduction from winning amount (sum of the three settlement fields below)
    @Column(nullable = false, precision = 15, scale = 2)
    private BigDecimal discountAmount;

    // Breakdown of discountAmount:
    @Column(nullable = false, precision = 15, scale = 2)
    @Builder.Default
    private BigDecimal installmentSettlement = BigDecimal.ZERO;  // current month installment collected

    @Column(nullable = false, precision = 15, scale = 2)
    @Builder.Default
    private BigDecimal crossChitSettlement = BigDecimal.ZERO;    // dues from other chits collected

    @Column(nullable = false, precision = 15, scale = 2)
    @Builder.Default
    private BigDecimal manualAdjustment = BigDecimal.ZERO;       // admin-entered extra deduction

    // Comma-separated draw month numbers included in installmentSettlement, e.g. "3" or "2,3"
    @Column(length = 100)
    private String installmentSettlementMonths;

    // Computed: winningAmount - discountAmount (what winner actually receives)
    @Column(nullable = false, precision = 15, scale = 2)
    private BigDecimal netPayoutAmount;

    // Running total of amounts actually sent so far (supports partial disbursement)
    @Column(nullable = false, precision = 15, scale = 2)
    @Builder.Default
    private BigDecimal disbursedAmount = BigDecimal.ZERO;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, columnDefinition = "varchar(20)")
    private PayoutStatus status;

    @Enumerated(EnumType.STRING)
    @Column(columnDefinition = "varchar(20)")
    private DisbursementMode disbursementMode;

    // UTR number, UPI transaction ID, cheque number — null for CASH or PENDING
    @Column(length = 50)
    private String referenceNumber;

    @Column(columnDefinition = "text")
    private String notes;

    @Column(nullable = false)
    private UUID createdBy;

    private LocalDateTime disbursedAt;
    private UUID disbursedBy;

    private LocalDateTime cancelledAt;
    private UUID cancelledBy;

    @Column(columnDefinition = "text")
    private String cancellationReason;

    private LocalDateTime voidedAt;
    private UUID voidedBy;

    @Column(columnDefinition = "text")
    private String voidReason;

    @Column(nullable = false)
    private LocalDateTime createdAt;

    @Column(nullable = false)
    private LocalDateTime updatedAt;

    @PrePersist
    void prePersist() {
        status = PayoutStatus.PENDING;
        createdAt = LocalDateTime.now();
        updatedAt = createdAt;
    }

    @PreUpdate
    void preUpdate() {
        updatedAt = LocalDateTime.now();
    }
}
