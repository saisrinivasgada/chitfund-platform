package com.chitfund.chitservice.domain.entity;

import com.chitfund.chitservice.domain.enums.InvitationStatus;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Entity
@Table(name = "chit_invitations",
        indexes = {
                @Index(name = "idx_invitations_chit", columnList = "chit_id, tenant_id"),
                @Index(name = "idx_invitations_status", columnList = "status")
        })
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ChitInvitation {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "chit_id", nullable = false)
    private Chit chit;

    @Column(name = "tenant_id", nullable = false, columnDefinition = "varchar(36)")
    private String tenantId;

    @Column(columnDefinition = "TEXT")
    private String message;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, columnDefinition = "varchar(20)")
    @Builder.Default
    private InvitationStatus status = InvitationStatus.OPEN;

    @Column(nullable = false, columnDefinition = "varchar(36)")
    private UUID createdBy;

    @Column(nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column
    private LocalDateTime updatedAt;

    @Column
    private LocalDateTime closedAt;

    @ElementCollection
    @CollectionTable(name = "chit_invitation_recipients",
            joinColumns = @JoinColumn(name = "invitation_id"))
    @Column(name = "member_id", columnDefinition = "varchar(36)")
    @Builder.Default
    private List<UUID> recipientMemberIds = new ArrayList<>();

    @OneToMany(mappedBy = "invitation", cascade = CascadeType.ALL, orphanRemoval = true)
    @Builder.Default
    private List<InvitationResponse> responses = new ArrayList<>();

    @PrePersist
    void prePersist() {
        createdAt = updatedAt = LocalDateTime.now();
        if (status == null) status = InvitationStatus.OPEN;
    }

    @PreUpdate
    void preUpdate() {
        updatedAt = LocalDateTime.now();
    }
}
