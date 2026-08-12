package com.chitfund.userservice.domain.entity;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "referral_credits")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ReferralCredit {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false, columnDefinition = "char(36)")
    private UUID referrerTenantId;

    @Column(nullable = false, columnDefinition = "char(36)")
    private UUID referredTenantId;

    @Column(nullable = false, columnDefinition = "char(36)")
    private UUID promoId;

    @Column(nullable = false, precision = 10, scale = 2)
    private BigDecimal creditInr;

    @Column(nullable = false, length = 20)
    @Builder.Default
    private String status = "PENDING";

    // Set when super-admin activates the referred org; credit releases 30 days after this
    private LocalDateTime creditEligibleAt;

    // Set when status transitions to CREDITED
    private LocalDateTime creditedAt;

    @Column(nullable = false, updatable = false)
    @Builder.Default
    private LocalDateTime createdAt = LocalDateTime.now();
}
