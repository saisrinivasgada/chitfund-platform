package com.chitfund.userservice.domain.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "tenants")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Tenant {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false, length = 100)
    private String name;

    @Column(nullable = false, length = 50, unique = true)
    private String slug;

    @Column(nullable = false, length = 20)
    @Builder.Default
    private String status = "ACTIVE";

    @Column(nullable = false, length = 20)
    @Builder.Default
    private String plan = "BASIC";

    private LocalDateTime planExpiresAt;

    @Column(length = 20)
    private String requestedPlan;

    private LocalDateTime upgradeRequestedAt;

    @Column(name = "renewal_requested_at")
    private LocalDateTime renewalRequestedAt;

    @Column(name = "cancellation_requested_at")
    private LocalDateTime cancellationRequestedAt;

    @Column(name = "cancellation_requested_by", length = 36)
    private String cancellationRequestedBy;

    @Column(length = 20)
    private String contactPhone;

    @Column(length = 100)
    private String contactEmail;

    @Column(length = 50, unique = true)
    private String referralCode;

    @Column(length = 36)
    private String appliedPromoId;

    @Column(nullable = false, precision = 10, scale = 2)
    @Builder.Default
    private java.math.BigDecimal creditBalanceInr = java.math.BigDecimal.ZERO;

    private LocalDateTime promoDiscountUntil;

    private LocalDateTime termsAcceptedAt;

    @Column(length = 20)
    private String termsVersion;

    @Column(columnDefinition = "char(36)")
    private UUID createdBy;

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
}
