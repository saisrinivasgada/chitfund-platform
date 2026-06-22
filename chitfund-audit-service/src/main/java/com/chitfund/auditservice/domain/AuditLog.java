package com.chitfund.auditservice.domain;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.UUID;

/**
 * Append-only record of every significant action in the platform.
 *
 * WHY no @UpdateTimestamp / updatedAt?
 * Audit logs must be immutable. If you could update an audit record,
 * an admin could cover their tracks. The DB also has no UPDATE/DELETE
 * privileges granted to the app user — enforced at the DB layer too.
 *
 * WHY JSON strings for before/after state instead of separate columns?
 * Each entity type (Chit, Payment, Payout, Member) has a different shape.
 * Normalizing into typed columns would require 20+ nullable columns or
 * a complex EAV schema. JSON text is compact, flexible, and good enough
 * for human investigation. At Stripe/Razorpay scale you'd push to
 * Elasticsearch for full-text + structured querying.
 */
@Entity
@Table(name = "audit_logs")
@Getter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AuditLog {

    @Id
    @Column(length = 36)
    private String id;

    @Column(name = "service_name", nullable = false, length = 50)
    private String serviceName;

    @Column(name = "entity_type", nullable = false, length = 50)
    private String entityType;

    @Column(name = "entity_id", nullable = false, length = 36)
    private String entityId;

    @Column(name = "chit_id", length = 36)
    private String chitId;

    @Column(name = "action", nullable = false, length = 60)
    private String action;

    @Column(name = "actor_id", length = 36)
    private String actorId;

    @Column(name = "actor_role", length = 30)
    private String actorRole;

    @Column(name = "actor_ip", length = 45)
    private String actorIp;

    @Column(name = "before_state", columnDefinition = "TEXT")
    private String beforeState;

    @Column(name = "after_state", columnDefinition = "TEXT")
    private String afterState;

    @Column(name = "metadata", columnDefinition = "TEXT")
    private String metadata;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    public static AuditLog create(String serviceName, String entityType, String entityId,
                                  String action, String actorId, String actorRole) {
        return AuditLog.builder()
                .id(UUID.randomUUID().toString())
                .serviceName(serviceName)
                .entityType(entityType)
                .entityId(entityId)
                .action(action)
                .actorId(actorId)
                .actorRole(actorRole)
                .createdAt(Instant.now())
                .build();
    }
}
