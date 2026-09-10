package com.chitfund.paymentservice.domain;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;
import java.util.UUID;

/** Immutable audit fact written in the same transaction as a settlement change. */
@Entity
@Table(name = "settlement_audit_events")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SettlementAuditEvent {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "tenant_id", nullable = false, length = 36, updatable = false)
    private String tenantId;

    @Column(name = "event_type", nullable = false, length = 40, updatable = false)
    private String eventType;

    @Column(name = "settlement_id", nullable = false, length = 36, updatable = false)
    private UUID settlementId;

    @Column(name = "related_settlement_id", length = 36, updatable = false)
    private UUID relatedSettlementId;

    @Column(name = "actor_id", nullable = false, length = 36, updatable = false)
    private UUID actorId;

    @Column(name = "reason", length = 500, updatable = false)
    private String reason;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @PrePersist
    void prePersist() {
        if (createdAt == null) createdAt = LocalDateTime.now();
    }
}
