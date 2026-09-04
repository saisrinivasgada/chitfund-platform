package com.chitfund.chitservice.domain.entity;

import com.chitfund.chitservice.domain.enums.ResponseStatus;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "chit_invitation_responses",
        indexes = {
                @Index(name = "idx_inv_responses_invitation", columnList = "invitation_id"),
                @Index(name = "idx_inv_responses_member", columnList = "member_id")
        },
        uniqueConstraints = @UniqueConstraint(name = "uq_inv_member", columnNames = {"invitation_id", "member_id"}))
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class InvitationResponse {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "invitation_id", nullable = false)
    private ChitInvitation invitation;

    @Column(nullable = false, columnDefinition = "varchar(36)")
    private UUID memberId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, columnDefinition = "varchar(30)")
    @Builder.Default
    private ResponseStatus responseStatus = ResponseStatus.PENDING;

    @Column(columnDefinition = "TEXT")
    private String reason;

    // For LOTTERY / AUCTION chits
    @Column
    private Integer spotsRequested;

    @Column
    private Integer approvedSpots;

    // For RESERVATION chits — stored as JSON array e.g. "[3,7,11]"
    @Column(columnDefinition = "TEXT")
    private String requestedDrawNumbers;

    @Column(columnDefinition = "TEXT")
    private String approvedDrawNumbers;

    @Column(nullable = false)
    @Builder.Default
    private boolean approved = false;

    @Column
    private LocalDateTime approvedAt;

    @Column(columnDefinition = "varchar(36)")
    private UUID approvedBy;

    @Column
    private LocalDateTime respondedAt;

    @Column(name = "admin_rejection_reason", columnDefinition = "TEXT")
    private String adminRejectionReason;

    @PrePersist
    void prePersist() {
        if (responseStatus == null) responseStatus = ResponseStatus.PENDING;
    }
}
