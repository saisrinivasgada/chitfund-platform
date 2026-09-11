package com.chitfund.paymentservice.domain;

import com.chitfund.paymentservice.domain.enums.PaymentRecordStatus;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

/** Immutable before-state for a payment record cleared by a settlement. */
@Entity
@Table(name = "settlement_payment_record_effects",
        uniqueConstraints = @UniqueConstraint(name = "uq_settlement_record_effect",
                columnNames = {"settlement_id", "payment_record_id"}))
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SettlementPaymentRecordEffect {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "tenant_id", nullable = false, length = 36, updatable = false)
    private String tenantId;

    @Column(name = "settlement_id", nullable = false, length = 36, updatable = false)
    private UUID settlementId;

    @Column(name = "payment_record_id", nullable = false, length = 36, updatable = false)
    private UUID paymentRecordId;

    @Enumerated(EnumType.STRING)
    @Column(name = "before_status", nullable = false, length = 20, updatable = false,
            columnDefinition = "varchar(20)")
    private PaymentRecordStatus beforeStatus;

    @Enumerated(EnumType.STRING)
    @Column(name = "after_status", nullable = false, length = 20, updatable = false,
            columnDefinition = "varchar(20)")
    private PaymentRecordStatus afterStatus;

    @Column(name = "before_amount_paid", nullable = false, precision = 15, scale = 2, updatable = false)
    private BigDecimal beforeAmountPaid;

    @Column(name = "before_amount_due", nullable = false, precision = 15, scale = 2, updatable = false)
    private BigDecimal beforeAmountDue;

    @Column(name = "reversed_at")
    private LocalDateTime reversedAt;
}
