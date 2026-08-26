package com.chitfund.userservice.domain.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * WHY FetchType.LAZY on the user join?
 * - EAGER loading would fetch the full User every time you load a RefreshToken,
 *   even when you only need to check if the token is revoked.
 * - LAZY = "load the user only when I actually access refreshToken.getUser()"
 * - This is the default for @ManyToOne in JPA, but we make it explicit.
 *
 * INTERVIEW: "N+1 problem — if you load 100 refresh tokens and each triggers
 * a separate user query, that's 101 queries. Fix: JOIN FETCH in JPQL, or
 * EntityGraph, or @BatchSize for collections."
 */
@Entity
@Table(name = "refresh_tokens")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class RefreshToken {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(unique = true, nullable = false)
    private String token;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(nullable = false)
    private LocalDateTime expiresAt;

    @Column(nullable = false)
    @Builder.Default
    private boolean revoked = false;

    @Column(nullable = false, updatable = false)
    @Builder.Default
    private LocalDateTime createdAt = LocalDateTime.now();

    /** Tenant this token is scoped to; null for super-admin sessions. */
    @Column(name = "tenant_id")
    private String tenantId;

    public boolean isExpired() {
        return LocalDateTime.now().isAfter(expiresAt);
    }
}