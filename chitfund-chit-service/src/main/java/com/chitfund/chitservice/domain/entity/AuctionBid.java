package com.chitfund.chitservice.domain.entity;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "auction_bids")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AuctionBid {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "tenant_id", nullable = false, updatable = false, length = 36)
    private String tenantId;

    @Column(nullable = false)
    private UUID auctionSessionId;

    @Column(nullable = false)
    private UUID chitId;

    @Column(nullable = false)
    private UUID memberId;

    // What this member agreed to accept as payout
    @Column(nullable = false, precision = 15, scale = 2)
    private BigDecimal bidAmount;

    // scheduledPayout - bidAmount
    @Column(nullable = false, precision = 15, scale = 2)
    private BigDecimal discountOffered;

    @Column(nullable = false, updatable = false)
    private LocalDateTime bidTime;

    @PrePersist
    void prePersist() {
        bidTime = LocalDateTime.now();
    }
}
