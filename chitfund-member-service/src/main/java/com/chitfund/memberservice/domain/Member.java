package com.chitfund.memberservice.domain;

import com.chitfund.memberservice.domain.enums.MemberStatus;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "members")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Member {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false)
    private String fullName;

    // Unique — used as the primary lookup key for workers during cash collection
    @Column(nullable = false, unique = true)
    private String phone;

    @Column(name = "phone_country_code", length = 6, nullable = false)
    private String phoneCountryCode;

    private String email;
    private String address;
    private String city;

    // WHY only last 4? Full Aadhaar requires UIDAI-compliant encrypted storage.
    // Last 4 is enough for identity verification during field visits.
    @Column(columnDefinition = "char(4)")
    private String aadhaarLast4;

    @Column(length = 10)
    private String panNumber;

    // Bank details — populated when member wins a payout
    private String bankName;
    private String bankAccountNumber;

    @Column(length = 11)
    private String bankIfsc;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, columnDefinition = "varchar(20)")
    private MemberStatus status;

    // Nullable — only set when member has an app login in user-service
    private UUID userId;

    // Admin-only notes: "Pays on 5th of every month", "Contact via WhatsApp only"
    @Column(columnDefinition = "text")
    private String notes;

    // Self-referential: which existing member referred this one. ON DELETE SET NULL.
    @Column(name = "referred_by_id", columnDefinition = "char(36)")
    private UUID referredById;

    @Column(nullable = false)
    private UUID createdBy;

    @Column(nullable = false)
    private LocalDateTime createdAt;

    @Column(nullable = false)
    private LocalDateTime updatedAt;

    private LocalDateTime deletedAt;

    @Column(columnDefinition = "char(36)")
    private UUID deletedBy;

    @PrePersist
    void prePersist() {
        status = status != null ? status : MemberStatus.ACTIVE;
        createdAt = LocalDateTime.now();
        updatedAt = createdAt;
    }

    @PreUpdate
    void preUpdate() {
        updatedAt = LocalDateTime.now();
    }
}
