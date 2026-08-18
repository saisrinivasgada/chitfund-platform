package com.chitfund.userservice.domain.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

@Entity
@Table(name = "tenant_custom_limits")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TenantCustomLimits {

    @Id
    @Column(name = "tenant_id", length = 36)
    private String tenantId;

    @Column(name = "max_active_chits", nullable = false)
    private int maxActiveChits;

    @Column(name = "max_members", nullable = false)
    private int maxMembers;

    @Column(name = "max_staff", nullable = false)
    private int maxStaff;

    @Column(name = "analytics_enabled", nullable = false)
    private boolean analyticsEnabled;

    @Column(name = "priority_support", nullable = false)
    private boolean prioritySupport;

    @Column(name = "capabilities", columnDefinition = "text")
    private String capabilities;

    @Column(name = "allowed_chit_types", nullable = false, length = 200)
    private String allowedChitTypes;

    @Column(name = "price_monthly_inr", nullable = false)
    private long priceMonthlyInr;

    @Column(name = "plan_code", nullable = false, length = 20)
    @Builder.Default
    private String planCode = "CUSTOM";

    @Column(columnDefinition = "text")
    private String notes;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @PrePersist
    void prePersist() { createdAt = updatedAt = LocalDateTime.now(); }

    @PreUpdate
    void preUpdate() { updatedAt = LocalDateTime.now(); }
}
