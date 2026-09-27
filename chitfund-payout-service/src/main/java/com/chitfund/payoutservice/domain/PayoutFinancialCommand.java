package com.chitfund.payoutservice.domain;

import com.chitfund.payoutservice.domain.enums.DisbursementMode;
import com.chitfund.payoutservice.domain.enums.PayoutFinancialCommandType;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "payout_financial_commands",
        uniqueConstraints = {
                @UniqueConstraint(name = "uq_pfc_dedupe", columnNames = "dedupe_key"),
                @UniqueConstraint(name = "uq_pfc_payout_sequence",
                        columnNames = {"payout_id", "sequence_no"})
        })
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PayoutFinancialCommand {
    @Id
    private UUID id;

    @Column(name = "tenant_id", nullable = false, length = 36, updatable = false)
    private String tenantId;

    @Column(name = "actor_id", nullable = false, updatable = false)
    private UUID actorId;

    @Column(name = "payout_id", nullable = false, updatable = false)
    private UUID payoutId;

    @Column(name = "sequence_no", nullable = false, updatable = false)
    private long sequenceNo;

    @Column(name = "dedupe_key", nullable = false, length = 200, updatable = false)
    private String dedupeKey;

    @Enumerated(EnumType.STRING)
    @Column(name = "command_type", nullable = false, length = 40, updatable = false)
    private PayoutFinancialCommandType commandType;

    @Column(name = "chit_id", updatable = false)
    private UUID chitId;

    @Column(name = "member_id", updatable = false)
    private UUID memberId;

    @Column(name = "month_number", updatable = false)
    private Integer monthNumber;

    @Column(precision = 15, scale = 2, updatable = false)
    private BigDecimal amount;

    @Enumerated(EnumType.STRING)
    @Column(name = "disbursement_mode", length = 20, updatable = false)
    private DisbursementMode disbursementMode;

    @Column(nullable = false, length = 12)
    private String status;

    @Column(nullable = false)
    private int attempts;

    @Column(name = "available_at", nullable = false)
    private LocalDateTime availableAt;

    @Column(name = "claimed_until")
    private LocalDateTime claimedUntil;

    @Column(name = "claim_token")
    private UUID claimToken;

    @Column(name = "last_error_code", length = 100)
    private String lastErrorCode;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "completed_at")
    private LocalDateTime completedAt;

    @PrePersist
    void prePersist() {
        LocalDateTime now = LocalDateTime.now();
        if (id == null) id = UUID.randomUUID();
        if (status == null) status = "PENDING";
        if (availableAt == null) availableAt = now;
        if (createdAt == null) createdAt = now;
    }
}
