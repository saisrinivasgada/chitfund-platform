package com.chitfund.userservice.domain.entity;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "promotions")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Promotion {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false, length = 50, unique = true)
    private String code;

    @Column(nullable = false, length = 200)
    private String label;

    @Column(columnDefinition = "TEXT")
    private String description;

    @Column(nullable = false, columnDefinition = "ENUM('STANDARD','REFERRAL')")
    @Builder.Default
    private String promoType = "STANDARD";

    @Column(nullable = false, precision = 5, scale = 2)
    @Builder.Default
    private BigDecimal discountPct = BigDecimal.ZERO;

    @Column(columnDefinition = "TEXT")
    private String appliesToPlans;

    @Column(precision = 10, scale = 2)
    private BigDecimal referrerCreditInr;

    private LocalDateTime validFrom;
    private LocalDateTime validUntil;

    // Discount duration: ONCE = next billing cycle, MONTHS = N months, FOREVER = never expires
    @Column(nullable = false, columnDefinition = "ENUM('ONCE','MONTHS','FOREVER')")
    @Builder.Default
    private String discountDurationType = "FOREVER";

    private Integer discountDurationMonths;

    private Integer maxUses;

    @Column(nullable = false)
    @Builder.Default
    private int usesCount = 0;

    @Column(nullable = false)
    @Builder.Default
    private boolean isPublic = false;

    @Column(nullable = false)
    @Builder.Default
    private boolean isActive = true;

    @Column(nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(nullable = false)
    private LocalDateTime updatedAt;

    @PrePersist
    void prePersist() { createdAt = updatedAt = LocalDateTime.now(); }

    @PreUpdate
    void preUpdate() { updatedAt = LocalDateTime.now(); }
}
