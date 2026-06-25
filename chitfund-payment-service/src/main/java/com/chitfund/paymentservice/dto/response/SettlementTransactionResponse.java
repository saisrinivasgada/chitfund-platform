package com.chitfund.paymentservice.dto.response;

import com.chitfund.paymentservice.domain.enums.PaymentMode;
import com.chitfund.paymentservice.domain.enums.SettlementPaymentStatus;
import com.chitfund.paymentservice.domain.enums.TransactionDirection;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Response returned after recording a settlement payment transaction.
 *
 * Includes both the transaction detail and the updated running totals from
 * the parent Settlement so the frontend can refresh its progress indicators
 * without a second GET call.
 *
 * WHY include remainingAmount here?
 * The frontend needs to show "₹X still to collect/disburse" immediately after
 * each transaction is recorded. Computing it server-side keeps the formula
 * in one place and avoids frontend arithmetic bugs on BigDecimal values.
 */
@Data
@Builder
public class SettlementTransactionResponse {

    // ── Transaction detail ─────────────────────────────────────────────────

    private UUID id;
    private UUID settlementId;
    private BigDecimal amount;
    private PaymentMode mode;
    private TransactionDirection direction;
    private String referenceNumber;
    private String notes;
    private UUID recordedBy;
    private LocalDateTime recordedAt;
    private LocalDateTime createdAt;
    private String idempotencyKey;

    // ── Running totals from the parent Settlement after this transaction ───

    /** Total collected from member so far (COLLECTION transactions). */
    private BigDecimal collectedAmount;

    /** Total disbursed to member so far (DISBURSEMENT transactions). */
    private BigDecimal disbursedAmount;

    /**
     * How much is still left to collect or disburse.
     * = abs(settlementNetAmount) - max(collectedAmount, disbursedAmount)
     * Zero when fully settled.
     */
    private BigDecimal remainingAmount;

    /** Settlement-level payment status after this transaction. */
    private SettlementPaymentStatus paymentStatus;

    /** The original net amount of the settlement (for context / display). */
    private BigDecimal settlementNetAmount;
}
