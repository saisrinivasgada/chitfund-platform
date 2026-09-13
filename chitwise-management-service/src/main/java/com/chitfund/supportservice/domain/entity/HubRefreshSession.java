package com.chitfund.supportservice.domain.entity;

import jakarta.persistence.*;
import lombok.*;
import java.time.Instant;

@Entity
@Table(name = "hub_refresh_sessions")
@Getter @Setter @Builder @NoArgsConstructor @AllArgsConstructor
public class HubRefreshSession {
    @Id private String id;
    @Column(name = "employee_id", nullable = false) private String employeeId;
    @Column(name = "token_hash", nullable = false, unique = true) private String tokenHash;
    @Column(name = "auth_version", nullable = false) private long authVersion;
    @Column(name = "expires_at", nullable = false) private Instant expiresAt;
    @Column(name = "revoked_at") private Instant revokedAt;
    @Column(name = "created_at", nullable = false) private Instant createdAt;

    @PrePersist void onCreate() { if (createdAt == null) createdAt = Instant.now(); }
}

