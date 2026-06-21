package com.chitfund.chitservice.domain.entity;

import com.chitfund.chitservice.domain.enums.WinnerSelectionMode;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Records who won which month of a chit, and how much they received.
 *
 * WHY store selectionMode here?
 * The chit's mode can theoretically change (edge case), and we want an immutable
 * audit record of exactly HOW the winner was selected for each month.
 *
 * WHY store winningAmount separately from chit.totalAmount?
 * In AUCTION mode, the winner accepts a lower payout (bid discount).
 * E.g., chit pot = ₹20,000, winner bid to take ₹17,000. winningAmount = ₹17,000.
 * The ₹3,000 difference is distributed as dividend to all members.
 * In LOTTERY/RESERVATION mode, winningAmount = totalAmount.
 */
@Entity
@Table(name = "monthly_winners")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class MonthlyWinner {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "chit_id", nullable = false)
    private Chit chit;

    @Column(nullable = false, columnDefinition = "varchar(36)")
    private UUID memberId;

    @Column(nullable = false)
    private Integer monthNumber;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, columnDefinition = "varchar(20)")
    private WinnerSelectionMode selectionMode;

    @Column(nullable = false, precision = 15, scale = 2)
    private BigDecimal winningAmount;

    // For AUCTION: how much discount the winner accepted
    @Column(precision = 15, scale = 2)
    private BigDecimal discountAmount;

    @Column(nullable = false, updatable = false)
    private LocalDateTime assignedAt;

    // UUID of manager who assigned this winner
    @Column(nullable = false, columnDefinition = "varchar(36)")
    private UUID assignedBy;

    @PrePersist
    void prePersist() {
        assignedAt = LocalDateTime.now();
    }
}
