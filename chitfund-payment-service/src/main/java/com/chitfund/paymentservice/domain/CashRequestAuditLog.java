package com.chitfund.paymentservice.domain;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "cash_request_audit_logs")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CashRequestAuditLog {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false)
    private UUID requestId;

    @Column(nullable = false, length = 50)
    private String action;

    @Column(length = 30)
    private String fromStatus;

    @Column(nullable = false, length = 30)
    private String toStatus;

    private UUID performedBy;

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
