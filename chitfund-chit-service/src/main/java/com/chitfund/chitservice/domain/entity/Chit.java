package com.chitfund.chitservice.domain.entity;

import com.chitfund.chitservice.domain.enums.ChitStatus;
import com.chitfund.chitservice.domain.enums.ChitType;
import com.chitfund.chitservice.domain.enums.WinnerSelectionMode;
import com.chitfund.common.exception.BusinessException;
import com.chitfund.common.exception.ErrorCode;
import jakarta.persistence.*;
import org.hibernate.annotations.Filter;
import org.hibernate.annotations.FilterDef;
import org.hibernate.annotations.ParamDef;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.UUID;

@FilterDef(name = "tenantFilter", parameters = @ParamDef(name = "tenantId", type = String.class))
@Filter(name = "tenantFilter", condition = "tenant_id = :tenantId")
@Entity
@Table(name = "chits")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Chit {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "tenant_id", nullable = false, columnDefinition = "varchar(36)")
    private String tenantId;

    // ── Type ──────────────────────────────────────────────────────────────────
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, columnDefinition = "varchar(20)")
    @Builder.Default
    private ChitType chitType = ChitType.RESERVATION;

    // ── Core fields ───────────────────────────────────────────────────────────
    @Column(nullable = false, length = 100)
    private String name;

    @Column(columnDefinition = "TEXT")
    private String description;

    // Face value of the chit per month (total pot): e.g. ₹2,00,000
    @Column(nullable = false, precision = 15, scale = 2)
    private BigDecimal chitValue;

    // What each member pays per month = chitValue / totalMembers
    @Column(nullable = false, precision = 15, scale = 2)
    private BigDecimal installmentAmount;

    // Alias: totalAmount = chitValue (kept for backward compat with payment-service)
    @Column(nullable = false, precision = 15, scale = 2)
    private BigDecimal totalAmount;

    @Column(nullable = false)
    private Integer totalMembers;

    @Column(nullable = false)
    private Integer durationMonths;

    // Day of month on which installment is due (e.g. 5 = 5th of every month)
    @Column
    private Integer monthlyDueDate;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, columnDefinition = "varchar(20)")
    private WinnerSelectionMode winnerSelectionMode;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, columnDefinition = "varchar(20)")
    @Builder.Default
    private ChitStatus status = ChitStatus.DRAFT;

    // ── Contribution rule ─────────────────────────────────────────────────────
    // If true, members who already received payout pay a different monthly amount
    @Column(nullable = false)
    @Builder.Default
    private boolean postPayoutContributionEnabled = false;

    // Default contribution amount after payout (used when per-reservation override is absent)
    @Column(precision = 15, scale = 2)
    private BigDecimal defaultPostPayoutContribution;

    // ── Org held spots ────────────────────────────────────────────────────────
    @Column(nullable = false)
    @Builder.Default
    private Integer orgHeldSpotsCount = 0;

    // ── Dates ─────────────────────────────────────────────────────────────────
    @Column
    private LocalDate startDate;

    @Column
    private LocalDate endDate;

    // ── Pause / resume ────────────────────────────────────────────────────────
    @Column
    private LocalDateTime pausedAt;

    @Column(columnDefinition = "varchar(36)")
    private UUID pausedBy;

    @Column(nullable = false)
    @Builder.Default
    private Integer totalPausedMonths = 0;

    // ── Soft delete ───────────────────────────────────────────────────────────
    @Column
    private LocalDateTime deletedAt;

    @Column(columnDefinition = "varchar(36)")
    private UUID deletedBy;

    // ── Dynamic attributes (JSON) ─────────────────────────────────────────────
    // WHY JSON column? Sparse optional metadata (e.g. "commissionRate", "penaltyRate")
    // doesn't warrant separate columns. JSON avoids EAV table join overhead.
    // MySQL 5.7+ validates JSON on write; generated columns can index specific paths.
    @Column(columnDefinition = "json")
    private String attributes;

    // ── Audit ─────────────────────────────────────────────────────────────────
    @Column(nullable = false, columnDefinition = "varchar(36)")
    private UUID createdBy;

    @Column(columnDefinition = "varchar(36)")
    private UUID updatedBy;

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

    public void transitionTo(ChitStatus newStatus) {
        if (!status.canTransitionTo(newStatus)) {
            throw new BusinessException(ErrorCode.INVALID_STATUS_TRANSITION,
                    String.format("Cannot transition chit from %s to %s", status, newStatus));
        }
        this.status = newStatus;
    }
}
