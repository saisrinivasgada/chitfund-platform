package com.chitfund.chitservice.domain.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Tracks which members are enrolled in which chit.
 *
 * WHY store memberId as UUID (not a FK to a users table)?
 * This is the DATABASE PER SERVICE pattern. Chit-service owns the chit schema.
 * Member data lives in member-service's own database. Cross-service joins at the DB level
 * would couple the services — exactly what microservices are designed to avoid.
 *
 * Instead, chit-service stores only the memberId UUID. When it needs member details
 * (name, phone), it calls member-service via HTTP (synchronous) or reads a
 * cached projection (eventual consistency).
 *
 * INTERVIEW: "In microservices, you never join across service boundaries at the DB level.
 * You join in the application layer — either via API calls, or by maintaining a local
 * read-only projection of the data you need (CQRS pattern)."
 */
@Entity
@Table(name = "chit_enrollments",
        indexes = {
                @Index(name = "idx_enrollments_chit_member", columnList = "chit_id, member_id"),
                @Index(name = "idx_enrollments_chit_active",  columnList = "chit_id, active")
        })
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ChitEnrollment {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "chit_id", nullable = false)
    private Chit chit;

    // Reference to member-service — not a DB foreign key across services
    @Column(nullable = false, columnDefinition = "varchar(36)")
    private UUID memberId;

    @Column(nullable = false, updatable = false)
    private LocalDateTime enrolledAt;

    @Column(nullable = false)
    @Builder.Default
    private boolean active = true;

    @PrePersist
    void prePersist() {
        enrolledAt = LocalDateTime.now();
    }
}
