package com.chitfund.reportingservice.domain;

import jakarta.persistence.*;
import org.hibernate.annotations.Filter;
import org.hibernate.annotations.FilterDef;
import org.hibernate.annotations.ParamDef;
import lombok.*;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

@FilterDef(name = "tenantFilter", parameters = @ParamDef(name = "tenantId", type = String.class))
@Filter(name = "tenantFilter", condition = "tenant_id = :tenantId")
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

    @Column(name = "tenant_id", nullable = false, length = 36)
    private String tenantId;

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

    public static PayoutSummary create(String chitId, String memberId, Integer monthNumber, String tenantId) {
        return PayoutSummary.builder()
                .id(UUID.randomUUID().toString())
                .tenantId(tenantId)
                .chitId(chitId)
                .memberId(memberId)
                .monthNumber(monthNumber)
                .discountAmount(BigDecimal.ZERO)
                .lastUpdated(Instant.now())
                .build();
    }
}
