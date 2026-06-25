package com.chitfund.paymentservice.dto.request;

import com.chitfund.paymentservice.domain.enums.PaymentMode;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * Request body for POST /settlement/{settlementId}/transactions.
 *
 * WHY is settlementId in the path AND available here from the path variable?
 * The field is kept here for completeness when the DTO is used in service layers,
 * but the controller extracts it from the path. The service uses the path variable
 * as the authoritative source.
 *
 * WHY is referenceNumber optional?
 * CASH payments have no UTR. UPI/BANK_TRANSFER should have one — the frontend
 * enforces this via UI validation; the backend trusts the operator's judgement
 * (adding a @NotBlank conditional validator per mode would require a custom annotation).
 *
 * WHY idempotencyKey max 36?
 * UUID canonical string length is 36 chars. Clients should generate a UUID per button
 * click and pass it as the key.
 */
@Data
public class RecordSettlementTransactionRequest {

    @NotNull(message = "Settlement ID is required")
    private UUID settlementId;

    @NotNull(message = "Amount is required")
    @Positive(message = "Amount must be positive")
    private BigDecimal amount;

    @NotNull(message = "Payment mode is required")
    private PaymentMode mode;

    /** UTR / UPI transaction ID / cheque number — optional for CASH. */
    private String referenceNumber;

    /** Free-form notes for this individual transaction. */
    private String notes;

    /**
     * Client-generated idempotency key (UUID format recommended, max 36 chars).
     * Re-submit the same key to safely retry without double-recording the payment.
     */
    @NotBlank(message = "Idempotency key is required")
    @Size(max = 36, message = "Idempotency key must not exceed 36 characters")
    private String idempotencyKey;
}
