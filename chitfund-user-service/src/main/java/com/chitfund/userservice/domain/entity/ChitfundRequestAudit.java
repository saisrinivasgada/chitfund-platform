package com.chitfund.userservice.domain.entity;

import com.chitfund.userservice.domain.enums.ChitfundRequestStatus;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "chitfund_request_audit")
@Getter @Setter @Builder @NoArgsConstructor @AllArgsConstructor
public class ChitfundRequestAudit {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "request_id", nullable = false, columnDefinition = "char(36)")
    private UUID requestId;

    @Column(nullable = false, length = 48)
    private String action;

    @Enumerated(EnumType.STRING)
    @Column(name = "from_status", length = 24)
    private ChitfundRequestStatus fromStatus;

    @Enumerated(EnumType.STRING)
    @Column(name = "to_status", length = 24)
    private ChitfundRequestStatus toStatus;

    @Column(name = "actor_id", columnDefinition = "char(36)")
    private UUID actorId;

    @Column(name = "actor_type", nullable = false, length = 24)
    private String actorType;

    @Column(length = 500)
    private String details;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @PrePersist
    void create() {
        if (createdAt == null) createdAt = LocalDateTime.now();
    }
}
