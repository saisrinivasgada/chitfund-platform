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

    @Column(nullable = false)
    private UUID chitId;

    @Column(nullable = false)
    private UUID memberId;

    @Column(nullable = false)
    private int monthNumber;

    // What the chit collected from all members for this month
    @Column(nullable = false, precision = 15, scale = 2)
    private BigDecimal winningAmount;

    // Auction discount: winner bid ₹48k on a ₹60k chit → discount = ₹12k
    // Lottery/Reservation: 0 (winner gets full amount)
    @Column(nullable = false, precision = 15, scale = 2)
    private BigDecimal discountAmount;

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
