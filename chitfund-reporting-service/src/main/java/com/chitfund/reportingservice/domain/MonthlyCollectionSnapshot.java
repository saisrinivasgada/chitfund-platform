package com.chitfund.reportingservice.domain;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.UpdateTimestamp;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(name = "monthly_collection_snapshots")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class MonthlyCollectionSnapshot {

    @Id
    @Column(length = 36)
    private String id;

    @Column(name = "chit_id", nullable = false, length = 36)
    private String chitId;

    @Column(name = "chit_name", length = 100)
    private String chitName;

    @Column(name = "month_number", nullable = false)
    private Integer monthNumber;

    @Column(name = "due_date", nullable = false)
    private LocalDate dueDate;

    @Column(name = "installment_amount", nullable = false, precision = 15, scale = 2)
    private BigDecimal installmentAmount;

    @Column(name = "total_members", nullable = false)
    private Integer totalMembers;

    @Column(name = "settled_count", nullable = false)
    private Integer settledCount;

    @Column(name = "partially_paid_count", nullable = false)
    private Integer partiallyPaidCount;

    @Column(name = "outstanding_count", nullable = false)
    private Integer outstandingCount;

    @Column(name = "waived_count", nullable = false)
    private Integer waivedCount;

    @Column(name = "total_collected", nullable = false, precision = 15, scale = 2)
    private BigDecimal totalCollected;

    @Column(name = "total_outstanding", nullable = false, precision = 15, scale = 2)
    private BigDecimal totalOutstanding;

    @Column(name = "cycle_status", nullable = false, columnDefinition = "varchar(20)")
    private String cycleStatus;

    @Column(name = "skip_reason", columnDefinition = "TEXT")
    private String skipReason;

    @Column(name = "last_updated", nullable = false)
    private Instant lastUpdated;

    public static MonthlyCollectionSnapshot create(String chitId) {
        return MonthlyCollectionSnapshot.builder()
                .id(UUID.randomUUID().toString())
                .chitId(chitId)
                .settledCount(0)
                .partiallyPaidCount(0)
                .outstandingCount(0)
                .waivedCount(0)
                .totalCollected(BigDecimal.ZERO)
                .totalOutstanding(BigDecimal.ZERO)
                .lastUpdated(Instant.now())
                .build();
    }
}
