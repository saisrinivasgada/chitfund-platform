package com.chitfund.paymentservice.domain;

import com.chitfund.paymentservice.domain.enums.PaymentRecordStatus;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "payment_records")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PaymentRecord {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false)
    private UUID chitId;

    @Column(nullable = false)
    private UUID memberId;

    @Column(nullable = false)
    private int monthNumber;

    // Denormalized from chit_month_draws — avoids join in balance queries
    @Column(nullable = false)
    private LocalDate dueDate;

    @Column(nullable = false, precision = 15, scale = 2)
    private BigDecimal amountDue;

    @Column(nullable = false, precision = 15, scale = 2)
    private BigDecimal amountPaid;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, columnDefinition = "varchar(20)")
    private PaymentRecordStatus status;

    // Set when status = PAYOUT_DEDUCTED — links back to the payout that withheld this installment.
    // Used by revertPayoutDeductions to undo across all chits in one call.
    private UUID settledByPayoutId;

    // Admin note: date the member said they will pay. No financial effect — purely operational.
    private LocalDate promisedPaymentDate;

    @Column(nullable = false)
    private LocalDateTime createdAt;

    @Column(nullable = false)
    private LocalDateTime updatedAt;

    @PrePersist
    void prePersist() {
        createdAt = LocalDateTime.now();
        updatedAt = createdAt;
    }

    @PreUpdate
    void preUpdate() {
        updatedAt = LocalDateTime.now();
    }
}
