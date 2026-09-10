package com.chitfund.paymentservice.domain;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;
import java.util.UUID;

/** Durable saga command for synchronizing member status after settlement commits. */
@Entity
@Table(name = "settlement_member_status_sync",
        uniqueConstraints = @UniqueConstraint(name = "uq_sms_settlement_status",
                columnNames = {"settlement_id", "desired_status"}))
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SettlementMemberStatusSync {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "tenant_id", nullable = false, length = 36, updatable = false)
    private String tenantId;

    @Column(name = "settlement_id", nullable = false, length = 36, updatable = false)
    private UUID settlementId;

    @Column(name = "member_id", nullable = false, length = 36, updatable = false)
    private UUID memberId;

    @Column(name = "desired_status", nullable = false, length = 10, updatable = false)
    private String desiredStatus;

    @Column(nullable = false, length = 12)
    private String status;

    @Column(nullable = false)
    private int attempts;

    @Column(name = "available_at", nullable = false)
    private LocalDateTime availableAt;

    @Column(name = "claimed_until")
    private LocalDateTime claimedUntil;

    @Column(name = "claim_token", length = 36)
    private UUID claimToken;

    @Column(name = "last_error", length = 500)
    private String lastError;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "completed_at")
    private LocalDateTime completedAt;

    @PrePersist
    void prePersist() {
        LocalDateTime now = LocalDateTime.now();
        if (status == null) status = "PENDING";
        if (availableAt == null) availableAt = now;
        if (createdAt == null) createdAt = now;
    }
}
