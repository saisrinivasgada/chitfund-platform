package com.chitfund.paymentservice.domain;

import com.chitfund.paymentservice.domain.enums.SettlementCase;
import com.chitfund.paymentservice.domain.enums.SettlementMode;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * Per-chit breakdown within a Settlement.
 *
 * WHY denormalize chitName, payoutStatus?
 * chit-service data is authoritative, but at settlement time we snapshot these values.
 * The settlement record must be self-contained for audit purposes — if a chit is later
 * deleted or renamed, the historical settlement still shows the correct context.
 *
 * netAmount is the final settlement figure for this chit:
 *   positive → member owes fund
 *   negative → fund owes member
 */
@Entity
@Table(name = "settlement_chit_items",
        indexes = {
                @Index(name = "idx_settlement_chit_item_settlement", columnList = "settlement_id"),
                @Index(name = "idx_settlement_chit_item_chit", columnList = "chit_id")
        })
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SettlementChitItem {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "settlement_id", nullable = false)
    private Settlement settlement;

    @Column(nullable = false, columnDefinition = "varchar(36)")
    private UUID chitId;

    // Denormalized snapshot at time of settlement
    @Column(nullable = false, length = 200)
    private String chitName;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, columnDefinition = "varchar(10)")
    private SettlementCase settlementCase;

    // null for CASE_A and CASE_B; FAIR or ADMIN_WIN for CASE_C
    @Enumerated(EnumType.STRING)
    @Column(columnDefinition = "varchar(15)")
    private SettlementMode settlementMode;

    // Denormalized payout status string (e.g. "DISBURSED", "PENDING", "NONE")
    @Column(length = 30)
    private String payoutStatus;

    @Column(precision = 15, scale = 2)
    private BigDecimal disbursedAmount;

    @Column(precision = 15, scale = 2)
    private BigDecimal netPayoutAmount;

    // Sum of (amountDue - amountPaid) for OUTSTANDING/PARTIALLY_PAID records
    @Column(nullable = false, precision = 15, scale = 2)
    private BigDecimal unpaidDues;

    // Future unbilled months × postPayoutRate
    @Column(nullable = false, precision = 15, scale = 2)
    private BigDecimal futureInstallments;

    // CASE_C → stillOwedByFund | CASE_B1 → payoutAmount | CASE_A/B2 → 0
    @Column(nullable = false, precision = 15, scale = 2)
    private BigDecimal payoutCredit;

    // CASE_B2 only: total amountPaid across all payment records for this chit
    @Column(precision = 15, scale = 2)
    private BigDecimal totalPaid;

    // Final settlement amount for this chit (positive = member owes, negative = fund refunds)
    @Column(nullable = false, precision = 15, scale = 2)
    private BigDecimal netAmount;

    // Human-readable explanation of how the figure was computed
    @Column(columnDefinition = "text")
    private String description;
}
