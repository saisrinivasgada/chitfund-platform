package com.chitfund.paymentservice.domain;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "payment_intimation_audit_logs")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PaymentIntimationAuditLog {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false, length = 36)
    private String tenantId;

    @Column(nullable = false, length = 36)
    private String intimationId;

    @Column(nullable = false, length = 50)
    private String action;

    @Column(length = 30)
    private String fromStatus;

    @Column(nullable = false, length = 30)
    private String toStatus;

    @Column(length = 36)
    private String performedBy;

    @Column(length = 30)
    private String performedByRole;

    @Column(columnDefinition = "text")
    private String reason;

    @Column(nullable = false)
    private LocalDateTime performedAt;

    @PrePersist
    void prePersist() {
        if (performedAt == null) performedAt = LocalDateTime.now();
    }
}
