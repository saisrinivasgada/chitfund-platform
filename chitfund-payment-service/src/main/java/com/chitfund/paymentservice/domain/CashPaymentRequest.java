package com.chitfund.paymentservice.domain;

import com.chitfund.paymentservice.domain.enums.CashRequestStatus;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "cash_payment_requests")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CashPaymentRequest {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false)
    private UUID memberId;

    @Column(nullable = false)
    private UUID chitId;

    // NULL = collect all outstanding; member can optionally specify an amount
    @Column(precision = 15, scale = 2)
    private BigDecimal requestedAmount;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, columnDefinition = "varchar(20)")
    private CashRequestStatus status;

    private UUID assignedWorkerId;
    private LocalDateTime assignedAt;
    private UUID assignedBy;

    @Column(columnDefinition = "text")
    private String notes;

    @Column(columnDefinition = "text")
    private String adminNotes;

    // Set after the worker calls /payments/collect — links back to the batch
    private UUID collectedBatchId;

    @Column(nullable = false)
    private LocalDateTime requestedAt;

    @Column(nullable = false)
    private LocalDateTime updatedAt;

    @PrePersist
    void prePersist() {
        requestedAt = LocalDateTime.now();
        updatedAt = requestedAt;
        if (status == null) status = CashRequestStatus.PENDING;
    }

    @PreUpdate
    void preUpdate() {
        updatedAt = LocalDateTime.now();
    }
}
