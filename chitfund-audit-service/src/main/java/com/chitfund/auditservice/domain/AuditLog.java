package com.chitfund.auditservice.domain;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.Immutable;

import java.time.Instant;
import java.util.UUID;

/**
 * Append-only record of every significant action in the platform.
 *
 * WHY no @UpdateTimestamp / updatedAt?
 * Audit logs must be immutable. If you could update an audit record,
 * an admin could cover their tracks. The application repository deliberately exposes no
 * update/delete operations and lifecycle callbacks reject entity mutation.
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
@Immutable
@Getter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AuditLog {

    @Id
    @Column(length = 36)
    private String id;

    @Column(name = "tenant_id", nullable = false, length = 36)
    private String tenantId;

    @Column(name = "service_name", nullable = false, length = 50)
    private String serviceName;

    @Column(name = "entity_type", nullable = false, length = 50)
    private String entityType;

    @Column(name = "entity_id", nullable = false, length = 100)
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

    @Column(name = "correlation_id", length = 100)
    private String correlationId;

    @Column(name = "idempotency_key", length = 100)
    private String idempotencyKey;

    @Column(name = "source", nullable = false, length = 30)
    private String source;

    @Column(name = "outcome", nullable = false, length = 20)
    private String outcome;

    @Column(name = "reason", length = 500)
    private String reason;

    @Column(name = "effective_actor_id", length = 36)
    private String effectiveActorId;

    @Column(name = "effective_actor_role", length = 30)
    private String effectiveActorRole;

    @Column(name = "device_session_hash", length = 128)
    private String deviceSessionHash;

    @Column(name = "occurred_at", nullable = false, updatable = false)
    private Instant occurredAt;

    @Column(name = "original_offline_at", updatable = false)
    private Instant originalOfflineAt;

    @Column(name = "synchronized_at", updatable = false)
    private Instant synchronizedAt;

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
                .outcome("SUCCESS")
                .occurredAt(Instant.now())
                .createdAt(Instant.now())
                .build();
    }

    @PreUpdate
    @PreRemove
    private void rejectMutation() {
        throw new IllegalStateException("Audit logs are append-only");
    }
}
