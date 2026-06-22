package com.chitfund.reportingservice.domain;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(name = "member_payment_summaries")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class MemberPaymentSummary {

    @Id
    @Column(length = 36)
    private String id;

    @Column(name = "chit_id", nullable = false, length = 36)
    private String chitId;

    @Column(name = "member_id", nullable = false, length = 36)
    private String memberId;

    @Column(name = "member_name", length = 100)
    private String memberName;

    @Column(name = "member_phone", length = 15)
    private String memberPhone;

    @Column(name = "total_due", nullable = false, precision = 15, scale = 2)
    private BigDecimal totalDue;

    @Column(name = "total_paid", nullable = false, precision = 15, scale = 2)
    private BigDecimal totalPaid;

    @Column(name = "total_outstanding", nullable = false, precision = 15, scale = 2)
    private BigDecimal totalOutstanding;

    @Column(name = "months_settled", nullable = false)
    private Integer monthsSettled;

    @Column(name = "months_partially_paid", nullable = false)
    private Integer monthsPartiallyPaid;

    @Column(name = "months_outstanding", nullable = false)
    private Integer monthsOutstanding;

    @Column(name = "months_waived", nullable = false)
    private Integer monthsWaived;

    @Column(name = "last_payment_date")
    private LocalDate lastPaymentDate;

    @Column(name = "last_payment_amount", precision = 15, scale = 2)
    private BigDecimal lastPaymentAmount;

    @Column(name = "last_updated", nullable = false)
    private Instant lastUpdated;

    public static MemberPaymentSummary create(String memberId, String chitId) {
        return MemberPaymentSummary.builder()
                .id(UUID.randomUUID().toString())
                .memberId(memberId)
                .chitId(chitId)
                .totalDue(BigDecimal.ZERO)
                .totalPaid(BigDecimal.ZERO)
                .totalOutstanding(BigDecimal.ZERO)
                .monthsSettled(0)
                .monthsPartiallyPaid(0)
                .monthsOutstanding(0)
                .monthsWaived(0)
                .lastUpdated(Instant.now())
                .build();
    }
}
