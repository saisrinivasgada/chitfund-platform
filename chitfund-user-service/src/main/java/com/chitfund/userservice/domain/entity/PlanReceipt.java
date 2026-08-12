package com.chitfund.userservice.domain.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

@Entity
@Table(name = "plan_receipts")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PlanReceipt {

    @Id
    private String id;

    @Column(nullable = false, length = 50, unique = true)
    private String receiptNumber;

    @Column(nullable = false, length = 36)
    private String paymentId;

    @Column(nullable = false, length = 36)
    private String tenantId;

    @Column(nullable = false, length = 20)
    private String type;    // PAYMENT | REFUND

    @Column(nullable = false)
    private long amountPaise;

    @Column(nullable = false)
    private LocalDateTime issuedAt;

    @PrePersist
    void prePersist() { if (issuedAt == null) issuedAt = LocalDateTime.now(); }
}
