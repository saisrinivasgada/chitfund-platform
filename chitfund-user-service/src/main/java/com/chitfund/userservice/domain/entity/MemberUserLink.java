package com.chitfund.userservice.domain.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "member_user_links",
       uniqueConstraints = @UniqueConstraint(columnNames = {"user_id", "tenant_id"}))
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class MemberUserLink {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "user_id", nullable = false, columnDefinition = "char(36)")
    private UUID userId;

    @Column(name = "tenant_id", nullable = false, columnDefinition = "char(36)")
    private UUID tenantId;

    @Column(name = "member_id", nullable = false, columnDefinition = "char(36)")
    private UUID memberId;

    @Column(nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @PrePersist
    void prePersist() {
        createdAt = LocalDateTime.now();
    }
}
