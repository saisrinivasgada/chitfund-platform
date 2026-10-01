package com.chitfund.paymentservice.domain;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.util.UUID;

@Entity
@Table(name = "payment_intimation_items")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PaymentIntimationItem {

    @Id
    @Column(length = 36)
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "intimation_id", nullable = false)
    @ToString.Exclude
    private PaymentIntimation intimation;

    @Column(nullable = false, length = 36)
    private String chitId;

    @Column(nullable = false, precision = 15, scale = 2)
    private BigDecimal claimedAmount;

    @Column(precision = 15, scale = 2)
    private BigDecimal approvedAmount;

    /** Set after the payment batch is created on approval. */
    @Column(length = 36)
    private String paymentBatchId;

    @PrePersist
    void prePersist() {
        if (id == null) id = UUID.randomUUID().toString();
    }
}
