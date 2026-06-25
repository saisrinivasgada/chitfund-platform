package com.chitfund.paymentservice.domain;

import com.chitfund.paymentservice.domain.enums.PaymentMode;
import com.chitfund.paymentservice.domain.enums.TransactionDirection;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Records a single payment event against a confirmed Settlement.
 *
 * WHY separate from Settlement?
 * A settlement net amount may be paid in multiple tranches — e.g. partial cash
 * collected today, remainder by UPI tomorrow. Each installment needs its own
 * audit trail (amount, mode, UTR, who recorded it, when).
 *
 * WHY idempotency_key?
 * The frontend or gateway may retry POST calls on network failure.
 * An idempotency key (typically a client-generated UUID per button click) ensures
 * the same payment is not recorded twice — we return the existing row on duplicate.
 *
 * INTERVIEW: "We chose pessimistic locking on the Settlement row during
 * recordTransaction so two concurrent admins cannot simultaneously update
 * collectedAmount and create a race condition. The idempotency key handles
 * the retry case at the HTTP layer."
 */
@Entity
@Table(
        name = "settlement_payment_transactions",
        indexes = {
                @Index(name = "idx_spt_settlement", columnList = "settlement_id")
        },
        uniqueConstraints = {
                @UniqueConstraint(name = "uk_spt_idempotency", columnNames = "idempotency_key")
        }
)
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SettlementPaymentTransaction {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    /** The settlement this transaction belongs to. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "settlement_id", nullable = false)
    private Settlement settlement;

    /** Amount of this individual payment (always positive). */
    @Column(nullable = false, precision = 15, scale = 2)
    private BigDecimal amount;

    /** How the payment was made. */
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private PaymentMode mode;

    /** Whether money moved into or out of the fund. */
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 15)
    private TransactionDirection direction;

    /** UTR number, UPI transaction ID, cheque number, etc. Nullable for CASH. */
    @Column(name = "reference_number", length = 50)
    private String referenceNumber;

    /** Free-form notes about this specific transaction. */
    @Column(columnDefinition = "text")
    private String notes;

    /** Admin who recorded this transaction. */
    @Column(name = "recorded_by", nullable = false, columnDefinition = "varchar(36)")
    private UUID recordedBy;

    /** When the actual payment occurred (may differ from createdAt for back-dated entries). */
    @Column(name = "recorded_at", nullable = false)
    private LocalDateTime recordedAt;

    /**
     * Client-supplied idempotency key (UUID format, max 36 chars).
     * Unique per transaction — duplicate key returns the existing row.
     */
    @Column(name = "idempotency_key", nullable = false, length = 36, unique = true)
    private String idempotencyKey;

    /** Set in @PrePersist — server-side insertion timestamp. */
    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @PrePersist
    void prePersist() {
        createdAt = LocalDateTime.now();
        if (recordedAt == null) recordedAt = LocalDateTime.now();
    }
}
