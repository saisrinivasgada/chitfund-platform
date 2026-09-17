package com.chitfund.supportservice.domain.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.HashSet;
import java.util.Set;

@Entity
@Table(name = "hub_custom_roles")
@Getter @Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class HubCustomRole {

    @Id
    private String id;

    @Column(nullable = false, unique = true)
    private String name;

    @Column
    private String description;

    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "hub_role_permissions", joinColumns = @JoinColumn(name = "role_id"))
    @Column(name = "permission")
    @Builder.Default
    private Set<String> permissions = new HashSet<>();

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @PrePersist
    void onCreate() {
        if (createdAt == null) createdAt = Instant.now();
        updatedAt = Instant.now();
    }

    @PreUpdate
    void onUpdate() { updatedAt = Instant.now(); }
}
