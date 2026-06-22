package com.chitfund.payoutservice.domain;

import com.chitfund.payoutservice.domain.enums.DisbursementMode;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "payout_disbursements")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PayoutDisbursement {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false)
    private UUID payoutId;

    @Column(nullable = false, precision = 15, scale = 2)
    private BigDecimal amount;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, columnDefinition = "varchar(20)")
    private DisbursementMode mode;

    @Column(length = 50)
    private String referenceNumber;

    @Column(columnDefinition = "text")
    private String notes;

    @Column(nullable = false)
    private UUID disbursedBy;

    @Column(nullable = false)
    private LocalDateTime disbursedAt;
}
