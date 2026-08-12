package com.chitfund.paymentservice.dto.response;

import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

/**
 * Full preview response for one member's settlement calculation across all their chits.
 */
@Data
@Builder
public class SettlementPreviewResponse {

    private UUID memberId;
    private String memberName;  // fetched from member-service for display

    private List<SettlementChitPreviewResponse> chitItems;

    // Totals (computed from all chit items)
    private BigDecimal totalOwed;       // sum of positive netAmounts
    private BigDecimal totalRefunded;   // sum of absolute values of negative netAmounts
    private BigDecimal grandTotal;      // totalOwed - totalRefunded (positive = member pays, negative = fund refunds)

    // Member's credit balance — offsets what they owe (or adds to what fund pays them)
    private BigDecimal creditBalance;

    // Grand total after applying credit (what's actually left to collect/pay)
    private BigDecimal netAfterCredit;
}
