package com.chitfund.chitservice.dto.response;

import com.chitfund.chitservice.domain.enums.AuctionMode;
import com.chitfund.chitservice.domain.enums.AuctionStatus;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@Data
@Builder
public class AuctionSessionResponse {
    private UUID id;
    private UUID chitId;
    private Integer monthNumber;
    private BigDecimal scheduledPayoutAmount;
    private BigDecimal minBidStep;
    private AuctionMode auctionMode;
    private AuctionStatus status;

    // Set when closed
    private UUID winnerId;
    private String winnerName;
    private BigDecimal wonAmount;
    private BigDecimal discountAmount;
    private BigDecimal dividendPerSpot;

    private LocalDateTime openedAt;
    private LocalDateTime closedAt;
    private LocalDateTime closesAt;  // null = no timer

    // Admin commission fields — always present for admin views; for members only exposed if showCommissionToMembers = true
    private String commissionType;        // "FIXED" or "PERCENTAGE"
    private BigDecimal commissionValue;   // the entered value (₹ or %)
    private BigDecimal commissionAmount;  // resolved ₹ amount (set after close)
    private boolean showCommissionToMembers;

    private List<AuctionBidResponse> bids;

    /** Total active slots in this chit (not distinct members — multi-spot members count multiple times). */
    private int totalSpots;
}
