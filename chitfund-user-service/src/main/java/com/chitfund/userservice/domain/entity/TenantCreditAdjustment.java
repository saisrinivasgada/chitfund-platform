package com.chitfund.userservice.domain.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "tenant_credit_adjustments")
@Getter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TenantCreditAdjustment {
    @Id
    private String id;

    @Column(nullable = false, length = 36)
    private String tenantId;

    @Column(nullable = false, length = 16)
    private String operation;

    @Column(nullable = false, precision = 14, scale = 2)
    private BigDecimal amountInr;

    @Column(nullable = false, length = 500)
    private String reason;

    @Column(nullable = false, unique = true, length = 255)
    private String idempotencyKey;

    @Column(nullable = false, length = 64)
    private String requestFingerprint;

    @Column(nullable = false, precision = 14, scale = 2)
    private BigDecimal balanceBeforeInr;

    @Column(nullable = false, precision = 14, scale = 2)
    private BigDecimal balanceAfterInr;

    @Column(nullable = false, length = 36)
    private String actorId;

    @Column(nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @PrePersist
    void prePersist() {
        if (createdAt == null) createdAt = LocalDateTime.now();
    }
}
