package com.chitfund.chitservice.domain.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "chit_lifecycle_commands")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ChitLifecycleCommand {
    @Id
    private UUID id;

    @Column(name = "tenant_id", nullable = false, length = 36, updatable = false)
    private String tenantId;

    @Column(name = "chit_id", nullable = false, updatable = false)
    private UUID chitId;

    @Column(name = "command_type", nullable = false, length = 40, updatable = false)
    private String commandType;

    @Column(name = "dedupe_key", nullable = false, length = 100, updatable = false)
    private String dedupeKey;

    @Column(nullable = false, length = 12)
    private String status;

    @Column(nullable = false)
    private int attempts;

    @Column(name = "available_at", nullable = false)
    private LocalDateTime availableAt;

    @Column(name = "claimed_until")
    private LocalDateTime claimedUntil;

    @Column(name = "claim_token")
    private UUID claimToken;

    @Column(name = "last_error_code", length = 100)
    private String lastErrorCode;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "completed_at")
    private LocalDateTime completedAt;

    @PrePersist
    void prePersist() {
        LocalDateTime now = LocalDateTime.now();
        if (id == null) id = UUID.randomUUID();
        if (status == null) status = "PENDING";
        if (availableAt == null) availableAt = now;
        if (createdAt == null) createdAt = now;
    }
}
