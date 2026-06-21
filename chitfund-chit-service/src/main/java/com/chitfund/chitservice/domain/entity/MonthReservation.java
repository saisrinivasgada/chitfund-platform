package com.chitfund.chitservice.domain.entity;

import com.chitfund.chitservice.domain.enums.ReservationStatus;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * One payout slot in the reservation schedule.
 *
 * WHY no unique constraint on (chit_id, reservation_month)?
 * A single month can have multiple payout allocations — e.g. Jan 2027 can pay
 * both ABC and XYZ. Each row is one payout slot. The chit schedule is built from
 * all rows ordered by reservation_month.
 *
 * WHY nullable memberId?
 * Unallocated months still appear in the schedule (so collections happen) but
 * memberId is null until admin assigns a winner. status = UNALLOCATED.
 *
 * WHY store reservation_month as LocalDate (first of month)?
 * Sorting, filtering, and display all work naturally on a date. Deriving
 * "Jan 2027" from month_number + chit start_date is fragile when pauses shift months.
 * An actual date is unambiguous regardless of pause history.
 *
 * WHY removed @Version (optimistic locking)?
 * The old model had ONE slot per month → two threads racing = conflict.
 * The new model appends rows (INSERT, not UPDATE) → no race condition on a single row.
 * Conflicts on the same row are now rare; normal transaction isolation handles them.
 */
@Entity
@Table(name = "month_reservations",
        indexes = {
                @Index(name = "idx_reservations_chit_month", columnList = "chit_id, reservation_month"),
                @Index(name = "idx_reservations_member",     columnList = "chit_id, member_id"),
                @Index(name = "idx_reservations_status",     columnList = "status")
        })
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class MonthReservation {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "chit_id", nullable = false)
    private Chit chit;

    // null = unallocated slot
    @Column(columnDefinition = "varchar(36)")
    private UUID memberId;

    // Legacy ordinal (1-based). Kept for display; date is the source of truth.
    @Column
    private Integer monthNumber;

    // Actual calendar month of this payout slot (stored as 1st of that month)
    @Column
    private LocalDate reservationMonth;

    // What this slot pays out to the winner
    @Column(precision = 15, scale = 2)
    private BigDecimal payoutAmount;

    // Post-payout monthly contribution for this specific winner.
    // If null, falls back to chit.defaultPostPayoutContribution.
    @Column(precision = 15, scale = 2)
    private BigDecimal postPayoutContribution;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, columnDefinition = "varchar(20)")
    @Builder.Default
    private ReservationStatus status = ReservationStatus.RESERVED;

    // ── Void support ──────────────────────────────────────────────────────────
    @Column(columnDefinition = "TEXT")
    private String voidReason;

    @Column
    private LocalDateTime voidedAt;

    @Column(columnDefinition = "varchar(36)")
    private UUID voidedBy;

    // ── Audit ─────────────────────────────────────────────────────────────────
    @Column(nullable = false, columnDefinition = "varchar(36)")
    private UUID createdBy;

    @Column(nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column
    private LocalDateTime updatedAt;

    @Column(columnDefinition = "varchar(36)")
    private UUID updatedBy;

    @PrePersist
    void prePersist() {
        createdAt = updatedAt = LocalDateTime.now();
        if (status == null) status = ReservationStatus.RESERVED;
    }

    @PreUpdate
    void preUpdate() {
        updatedAt = LocalDateTime.now();
    }
}
