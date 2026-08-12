package com.chitfund.paymentservice.dto.response;

import com.chitfund.paymentservice.domain.enums.SettlementCase;
import com.chitfund.paymentservice.domain.enums.SettlementMode;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * Preview of the settlement calculation for one chit enrollment.
 *
 * Returned as part of SettlementPreviewResponse for each chit the member is enrolled in.
 * The frontend uses this to render the settlement table row and hover tooltip.
 */
@Data
@Builder
public class SettlementChitPreviewResponse {

    private UUID chitId;
    private String chitName;
    private String chitStatus;  // ACTIVE, COMPLETED, PAUSED, etc.

    private SettlementCase settlementCase;

    // Current mode (default FAIR for CASE_C, null for A/B)
    private SettlementMode currentMode;

    // Payout info
    private String payoutStatus;   // "DISBURSED", "PARTIALLY_DISBURSED", "PENDING", "NONE"
    private BigDecimal disbursedAmount;
    private BigDecimal netPayoutAmount;
    private Integer payoutMonthNumber;

    // Calculation inputs
    private BigDecimal unpaidDues;
    private BigDecimal futureInstallments;
    private int futureMonthsCount;
    private BigDecimal postPayoutRate;

    // CASE_C specific
    private BigDecimal stillOwedByFund;         // netPayoutAmount - disbursedAmount
    private BigDecimal installmentsPaidSincePayout;

    // CASE_B1 specific
    private BigDecimal reservedPayoutAmount;    // sum of MonthReservation.payoutAmount (display only)
    private Integer reservedMonthNumber;
    private int reservedSlotCount;              // number of RESERVED slots
    private BigDecimal fundOwesForReserved;     // totalPaidIn credited back for reserved slots

    // CASE_B2 specific
    private BigDecimal totalPaidIn;             // total amountPaid across all records

    // Final settlement amount for this chit at the current mode
    // positive = member owes, negative = fund refunds
    private BigDecimal netAmount;

    // For CASE_C: alternative mode net amount
    private BigDecimal alternativeModeAmount;   // what the OTHER mode would give
    private String alternativeModeName;         // "FAIR" or "ADMIN_WIN"

    // Human-readable description of the current calculation
    private String description;

    // Step-by-step breakdown for tooltip
    private String tooltipDetail;

    // Per-month payment records — shown when user expands the chit row
    private List<PaymentRecordDetail> paymentRecords;

    @Data
    @Builder
    public static class PaymentRecordDetail {
        private int monthNumber;
        private LocalDate dueDate;
        private BigDecimal amountDue;
        private BigDecimal amountPaid;
        private BigDecimal balance;   // amountDue - amountPaid
        private String status;        // OUTSTANDING, SETTLED, PARTIALLY_PAID, PAYOUT_DEDUCTED, WAIVED
    }
}
