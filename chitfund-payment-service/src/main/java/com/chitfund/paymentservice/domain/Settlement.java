package com.chitfund.paymentservice.domain;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Top-level record for a member exit settlement.
 *
 * WHY one Settlement per member (not per chit)?
 * Settlement is a single business event: "this member is leaving the fund."
 * Even if they are in 5 chits, it is one action by one admin at one moment in time.
 * The per-chit breakdown lives in SettlementChitItem.
 *
 * totalOwed    = sum of positive chit amounts (member pays fund)
 * totalRefunded = absolute value of sum of negative chit amounts (fund pays member)
 * netAmount    = totalOwed - totalRefunded (positive = member pays, negative = fund pays)
 */
@Entity
@Table(name = "settlements",
        indexes = {
                @Index(name = "idx_settlement_member", columnList = "member_id"),
                @Index(name = "idx_settlement_settled_at", columnList = "settled_at")
        })
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Settlement {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false, columnDefinition = "varchar(36)")
    private UUID memberId;

    // Admin who confirmed and executed the settlement
    @Column(nullable = false, columnDefinition = "varchar(36)")
    private UUID settledBy;

    @Column(nullable = false)
    private LocalDateTime settledAt;

    // Absolute value: how much the member owes across all settled chits (sum of positive items)
    @Column(nullable = false, precision = 15, scale = 2)
    private BigDecimal totalOwed;

    // Absolute value: how much the fund refunds across all settled chits (sum of |negative| items)
    @Column(nullable = false, precision = 15, scale = 2)
    private BigDecimal totalRefunded;

    // netAmount = totalOwed - totalRefunded. Negative means fund owes the member overall.
    @Column(nullable = false, precision = 15, scale = 2)
    private BigDecimal netAmount;

    @Column(columnDefinition = "text")
    private String notes;

    @Column(nullable = false)
    private LocalDateTime createdAt;

    @OneToMany(mappedBy = "settlement", cascade = CascadeType.ALL, orphanRemoval = true)
    @Builder.Default
    private List<SettlementChitItem> chitItems = new ArrayList<>();

    @PrePersist
    void prePersist() {
        createdAt = LocalDateTime.now();
        if (settledAt == null) settledAt = LocalDateTime.now();
    }
}
