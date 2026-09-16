package com.chitfund.supportservice.domain.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;

@Entity
@Table(name = "identity_case_audit")
@Getter @Setter @Builder @NoArgsConstructor @AllArgsConstructor
public class IdentityCaseAudit {
    @Id private String id;
    @Column(name = "identity_case_id", nullable = false) private String identityCaseId;
    @Column(nullable = false) private String action;
    @Column(name = "actor_id", nullable = false) private String actorId;
    @Column(columnDefinition = "TEXT") private String details;
    @Column(name = "created_at", nullable = false, updatable = false) private Instant createdAt;
    @PrePersist void create() { if (createdAt == null) createdAt = Instant.now(); }
}
