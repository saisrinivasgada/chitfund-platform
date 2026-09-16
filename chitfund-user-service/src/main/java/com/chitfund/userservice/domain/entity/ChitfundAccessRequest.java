package com.chitfund.userservice.domain.entity;

import com.chitfund.userservice.domain.enums.ChitfundRequestKind;
import com.chitfund.userservice.domain.enums.ChitfundRequestStatus;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "chitfund_access_requests")
@Getter @Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ChitfundAccessRequest {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "tenant_id", nullable = false, columnDefinition = "char(36)")
    private UUID tenantId;

    @Column(name = "member_id", nullable = false, columnDefinition = "char(36)")
    private UUID memberId;

    @Column(name = "requested_phone", nullable = false, length = 15)
    private String requestedPhone;

    @Column(name = "phone_country_code", nullable = false, length = 10)
    private String phoneCountryCode;

    @Column(name = "requested_email")
    private String requestedEmail;

    @Column(name = "candidate_user_id", nullable = false, columnDefinition = "char(36)")
    private UUID candidateUserId;

    @Column(name = "member_action_token_hash", length = 64, unique = true)
    private String memberActionTokenHash;

    @Enumerated(EnumType.STRING)
    @Column(name = "request_kind", nullable = false, length = 24)
    private ChitfundRequestKind requestKind;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 24)
    private ChitfundRequestStatus status;

    @Column(name = "requested_by", columnDefinition = "char(36)")
    private UUID requestedBy;

    @Column(name = "member_verified_at")
    private LocalDateTime memberVerifiedAt;

    @Column(name = "admin_confirmed_at")
    private LocalDateTime adminConfirmedAt;

    @Column(name = "admin_confirmed_by", columnDefinition = "char(36)")
    private UUID adminConfirmedBy;

    @Column(name = "expires_at", nullable = false)
    private LocalDateTime expiresAt;

    @Column(name = "resend_count", nullable = false)
    private int resendCount;

    @Column(name = "last_sent_at", nullable = false)
    private LocalDateTime lastSentAt;

    @Version
    private long version;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @PrePersist
    void onCreate() {
        LocalDateTime now = LocalDateTime.now();
        if (createdAt == null) createdAt = now;
        if (updatedAt == null) updatedAt = now;
        if (lastSentAt == null) lastSentAt = now;
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = LocalDateTime.now();
    }
}
