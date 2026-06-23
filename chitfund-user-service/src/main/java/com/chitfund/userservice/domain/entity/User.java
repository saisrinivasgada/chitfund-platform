package com.chitfund.userservice.domain.entity;

import com.chitfund.userservice.domain.enums.Role;
import jakarta.persistence.*;
import lombok.*;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;

import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;
import java.util.UUID;

/**
 * WHY implement UserDetails directly on the entity?
 * - Avoids a separate UserPrincipal wrapper class
 * - Spring Security's filter chain works directly with this object
 * - The authenticated Principal in controllers IS this User entity
 * - Trade-off: entity is coupled to Spring Security. At large scale you'd decouple
 *   (entity shouldn't know about security concerns). For this app, the pragmatism wins.
 *
 * WHY UUID as primary key instead of BIGINT?
 * - UUIDs are globally unique across services → no ID collision if you merge data
 * - Can generate ID client-side before DB insert (useful for event sourcing)
 * - Trade-off: UUID is 16 bytes vs 8 for BIGINT → larger indexes, slightly slower joins
 * - PostgreSQL gen_random_uuid() uses UUIDv4, which is random (not sequential)
 *   For sequential UUIDs (better index locality): UUIDv7 or ULID — worth knowing for interviews
 *
 * WHY @PrePersist/@PreUpdate instead of @CreationTimestamp?
 * - @CreationTimestamp is Hibernate-specific. @PrePersist is JPA standard.
 * - Explicit control: you see exactly when timestamps are set.
 */
@Entity
@Table(name = "users")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class User implements UserDetails {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(unique = true, nullable = false, length = 50)
    private String username;

    @Column(unique = true)
    private String email;

    @Column(length = 100)
    private String fullName;

    @Column(length = 15)
    private String phone;

    @Column(length = 10)
    private String phoneCountryCode;

    @Column(length = 100)
    private String city;

    @Column(length = 500)
    private String address;

    @Column(length = 4)
    private String aadhaarLast4;

    @Column(length = 10)
    private String panNumber;

    @Column(columnDefinition = "TEXT")
    private String notes;

    @Column(columnDefinition = "char(36)")
    private UUID referredById;

    @Column(nullable = false)
    private String passwordHash;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, columnDefinition = "varchar(20)")
    private Role role;

    @Column(nullable = false)
    @Builder.Default
    private boolean enabled = true;

    @Column(nullable = false)
    @Builder.Default
    private boolean locked = false;

    @Column(nullable = false)
    @Builder.Default
    private int failedLoginAttempts = 0;

    @Column(nullable = false)
    @Builder.Default
    private boolean mustChangePassword = false;

    // Populated by admin password-reset. Cleared when user logs in with their real password.
    // Lets the user choose which credential to use; only temp-password login forces a change.
    private String tempPasswordHash;

    private LocalDateTime lastLoginAt;

    private LocalDateTime deletedAt;

    @Column(columnDefinition = "char(36)")
    private UUID deletedBy;

    @Column(nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(nullable = false)
    private LocalDateTime updatedAt;

    @PrePersist
    void prePersist() {
        createdAt = updatedAt = LocalDateTime.now();
    }

    @PreUpdate
    void preUpdate() {
        updatedAt = LocalDateTime.now();
    }

    // ── UserDetails contract ──────────────────────────────────────────────────

    @Override
    public Collection<? extends GrantedAuthority> getAuthorities() {
        // Single role per user. If you need multiple roles, change to a Set<Role> field.
        // We use role.name() (e.g. "ADMIN") and match with hasAuthority("ADMIN") in SecurityConfig.
        return List.of(new SimpleGrantedAuthority(role.name()));
    }

    @Override
    public String getPassword() {
        return passwordHash;
    }

    @Override
    public boolean isAccountNonExpired() {
        return true;
    }

    @Override
    public boolean isAccountNonLocked() {
        return !locked;
    }

    @Override
    public boolean isCredentialsNonExpired() {
        return true;
    }
}