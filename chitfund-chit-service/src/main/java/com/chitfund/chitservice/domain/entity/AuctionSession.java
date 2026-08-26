package com.chitfund.chitservice.domain.entity;

import com.chitfund.chitservice.domain.enums.AuctionMode;
import com.chitfund.chitservice.domain.enums.AuctionStatus;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "auction_sessions")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AuctionSession {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "tenant_id", nullable = false, columnDefinition = "varchar(36)")
    private String tenantId;

    @Column(nullable = false)
    private UUID chitId;

    @Column(nullable = false)
    private Integer monthNumber;

    // The maximum prize for this month (pre-set by admin when opening the draw)
    @Column(nullable = false, precision = 15, scale = 2)
    private BigDecimal scheduledPayoutAmount;

    // Minimum amount by which a new bid must beat the current best (ONLINE only; null = any lower bid wins)
    @Column(precision = 15, scale = 2)
    private BigDecimal minBidStep;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, columnDefinition = "varchar(10)")
    private AuctionMode auctionMode;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, columnDefinition = "varchar(10)")
    @Builder.Default
    private AuctionStatus status = AuctionStatus.OPEN;

    // Optional admin commission on the auction discount
    // commissionType: "FIXED" (flat ₹) or "PERCENTAGE" (% of discount)
    @Column(name = "commission_type", length = 10)
    private String commissionType;

    @Column(name = "commission_value", precision = 15, scale = 2)
    private BigDecimal commissionValue;

    // Resolved ₹ amount — computed and stored at close time
    @Column(name = "commission_amount", precision = 15, scale = 2)
    private BigDecimal commissionAmount;

    @Column(name = "show_commission_to_members", nullable = false)
    @Builder.Default
    private boolean showCommissionToMembers = false;

    // Set when auction closes
    private UUID winnerId;
    private BigDecimal wonAmount;       // what winner accepted
    private BigDecimal discountAmount;  // scheduledPayout - wonAmount
    private BigDecimal dividendPerSpot; // distributableDiscount / totalSpots (after commission deduction)

    private UUID openedBy;
    private UUID closedBy;
    private LocalDateTime openedAt;
    private LocalDateTime closedAt;
    // Null = no timer (manual close only); non-null = auto-close when now() >= closesAt
    @Column(name = "closes_at")
    private LocalDateTime closesAt;

    @Column(nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(nullable = false)
    private LocalDateTime updatedAt;

    @PrePersist
    void prePersist() {
        createdAt = updatedAt = LocalDateTime.now();
    }

    @PreUpdate
    void preUpdate() {
        updatedAt = LocalDateTime.now();
    }
}
