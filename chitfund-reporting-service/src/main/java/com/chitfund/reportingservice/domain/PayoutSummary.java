package com.chitfund.reportingservice.domain;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(name = "payout_summaries")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PayoutSummary {

    @Id
    @Column(length = 36)
    private String id;

    @Column(name = "chit_id", nullable = false, length = 36)
    private String chitId;

    @Column(name = "member_id", nullable = false, length = 36)
    private String memberId;

    @Column(name = "member_name", length = 100)
    private String memberName;

    @Column(name = "month_number", nullable = false)
    private Integer monthNumber;

    @Column(name = "winning_amount", precision = 15, scale = 2)
    private BigDecimal winningAmount;

    @Column(name = "discount_amount", precision = 15, scale = 2)
    private BigDecimal discountAmount;

    @Column(name = "net_payout_amount", nullable = false, precision = 15, scale = 2)
    private BigDecimal netPayoutAmount;

    @Column(name = "status", nullable = false, columnDefinition = "varchar(20)")
    private String status;

    @Column(name = "disbursement_mode", columnDefinition = "varchar(20)")
    private String disbursementMode;

    @Column(name = "disbursed_at")
    private LocalDate disbursedAt;

    @Column(name = "last_updated", nullable = false)
    private Instant lastUpdated;

    public static PayoutSummary create(String chitId, String memberId, Integer monthNumber) {
        return PayoutSummary.builder()
                .id(UUID.randomUUID().toString())
                .chitId(chitId)
                .memberId(memberId)
                .monthNumber(monthNumber)
                .discountAmount(BigDecimal.ZERO)
                .lastUpdated(Instant.now())
                .build();
    }
}
