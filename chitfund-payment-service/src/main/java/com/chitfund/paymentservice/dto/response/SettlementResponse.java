package com.chitfund.paymentservice.dto.response;

import com.chitfund.paymentservice.domain.enums.SettlementCase;
import com.chitfund.paymentservice.domain.enums.SettlementMode;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

/**
 * Response returned after a settlement is confirmed and persisted.
 * Also used for settlement history queries.
 */
@Data
@Builder
public class SettlementResponse {

    private UUID id;
    private UUID memberId;
    private UUID settledBy;
    private LocalDateTime settledAt;

    private BigDecimal totalOwed;
    private BigDecimal totalRefunded;
    private BigDecimal netAmount;

    private String notes;
    private LocalDateTime createdAt;

    private List<ChitItemDetail> chitItems;

    @Data
    @Builder
    public static class ChitItemDetail {
        private UUID id;
        private UUID chitId;
        private String chitName;
        private SettlementCase settlementCase;
        private SettlementMode settlementMode;
        private String payoutStatus;
        private BigDecimal disbursedAmount;
        private BigDecimal netPayoutAmount;
        private BigDecimal unpaidDues;
        private BigDecimal futureInstallments;
        private BigDecimal payoutCredit;
        private BigDecimal totalPaid;
        private BigDecimal netAmount;
        private String description;
    }
}
