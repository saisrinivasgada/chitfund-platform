package com.chitfund.paymentservice.domain;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "member_credit_transactions")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class MemberCreditTransaction {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false)
    private UUID memberId;

    // Always positive — direction is captured in `type`
    @Column(nullable = false, precision = 15, scale = 2)
    private BigDecimal amount;

    // "IN" = credit added, "OUT" = credit consumed
    @Column(nullable = false, length = 10)
    private String type;

    // Which payment batch triggered this movement (used for void reversal)
    private UUID sourceBatchId;

    // Which chit this payment was for (informational)
    private UUID chitId;

    @Column(length = 500)
    private String description;

    @Column(nullable = false)
    private LocalDateTime createdAt;

    private UUID createdBy;

    @PrePersist
    void prePersist() {
        createdAt = LocalDateTime.now();
    }
}
