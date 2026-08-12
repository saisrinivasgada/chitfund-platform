package com.chitfund.userservice.domain.entity;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "plan_limits")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PlanLimits {

    @Id
    @Column(name = "plan", length = 20)
    private String plan;

    @Column(name = "display_name", nullable = false, length = 100)
    private String displayName;

    @Column(name = "tagline", length = 200)
    private String tagline;

    @Column(name = "features", columnDefinition = "text")
    private String features;

    @Column(name = "max_active_chits", nullable = false)
    private int maxActiveChits;

    @Column(name = "max_members", nullable = false)
    private int maxMembers;

    @Column(name = "allowed_chit_types", nullable = false, length = 200)
    private String allowedChitTypes;

    @Column(name = "price_monthly_inr", nullable = false)
    private long priceMonthlyInr;

    @Column(name = "global_discount_pct", precision = 5, scale = 2)
    private BigDecimal globalDiscountPct;

    @Column(name = "is_active", nullable = false)
    private boolean isActive = true;

    @Column(name = "is_public", nullable = false)
    private boolean isPublic = true;

    @Column(name = "display_order", nullable = false)
    private int displayOrder;

    @Column(name = "max_staff", nullable = false)
    private int maxStaff = 0;

    @Column(name = "analytics_enabled", nullable = false)
    private boolean analyticsEnabled = false;

    @Column(name = "priority_support", nullable = false)
    private boolean prioritySupport = false;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @PrePersist
    @PreUpdate
    void touch() {
        updatedAt = LocalDateTime.now();
    }
}
