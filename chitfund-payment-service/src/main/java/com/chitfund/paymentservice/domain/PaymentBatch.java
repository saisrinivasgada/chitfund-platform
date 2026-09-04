package com.chitfund.paymentservice.domain;

import com.chitfund.paymentservice.domain.enums.BatchStatus;
import com.chitfund.paymentservice.domain.enums.PaymentMode;
import jakarta.persistence.*;
import org.hibernate.annotations.Filter;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

@Filter(name = "tenantFilter", condition = "tenant_id = :tenantId")
@Entity
@Table(name = "payment_batches", uniqueConstraints = {
        @UniqueConstraint(name = "uk_payment_batch_tenant_operation_idem",
                columnNames = {"tenant_id", "idempotency_operation", "idempotency_key"})
})
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PaymentBatch {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "tenant_id", nullable = false, columnDefinition = "varchar(36)")
    private String tenantId;

    @Column(nullable = false)
    private UUID chitId;

    @Column(nullable = false)
    private UUID memberId;

    @Column(nullable = false, precision = 15, scale = 2)
    private BigDecimal totalAmount;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, columnDefinition = "varchar(20)")
    private PaymentMode paymentMode;

    // WHY varchar(25)? AWAITING_REMITTANCE = 20 chars, needs room.
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, columnDefinition = "varchar(25)")
    private BatchStatus status;

    private UUID collectedBy;       // worker who collected (CASH only)
    private UUID recordedBy;        // admin who recorded a direct (UPI/bank/self-cash) payment
    private LocalDateTime collectedAt;
    private LocalDateTime remittedAt;
    private UUID remittedBy;        // admin who confirmed receipt (CASH only)

    private LocalDateTime voidedAt;
    private UUID voidedBy;

    @Column(columnDefinition = "text")
    private String voidReason;

    @Column(columnDefinition = "text")
    private String notes;

    @Column(length = 64)
    private String idempotencyKey;

    @Column(name = "idempotency_operation", length = 32)
    private String idempotencyOperation;

    @Column(name = "idempotency_request_hash", length = 64)
    private String idempotencyRequestHash;

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
