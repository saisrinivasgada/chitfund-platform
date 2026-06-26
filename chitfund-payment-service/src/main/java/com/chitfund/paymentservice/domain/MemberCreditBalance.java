package com.chitfund.paymentservice.domain;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "member_credit_balance")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class MemberCreditBalance {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false, unique = true)
    private UUID memberId;

    @Column(nullable = false, precision = 15, scale = 2)
    private BigDecimal balance;

    @Column(nullable = false)
    private LocalDateTime createdAt;

    private LocalDateTime updatedAt;

    @PrePersist
    void prePersist() {
        createdAt = LocalDateTime.now();
        updatedAt = createdAt;
        if (balance == null) balance = BigDecimal.ZERO;
    }

    @PreUpdate
    void preUpdate() {
        updatedAt = LocalDateTime.now();
    }
}
