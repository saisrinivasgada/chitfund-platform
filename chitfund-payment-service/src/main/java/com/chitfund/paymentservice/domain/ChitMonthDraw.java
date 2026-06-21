package com.chitfund.paymentservice.domain;

import com.chitfund.paymentservice.domain.enums.DrawStatus;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "chit_month_draws")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ChitMonthDraw {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false)
    private UUID chitId;

    @Column(nullable = false)
    private int monthNumber;

    @Column(nullable = false)
    private LocalDate dueDate;

    @Column(nullable = false, precision = 15, scale = 2)
    private BigDecimal installmentAmount;

    @Column(nullable = false)
    private int totalMembers;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, columnDefinition = "varchar(20)")
    private DrawStatus status;

    @Column(columnDefinition = "text")
    private String skipReason;

    private LocalDateTime openedAt;
    private UUID openedBy;
    private LocalDateTime closedAt;
    private UUID closedBy;
    private LocalDateTime skippedAt;
    private UUID skippedBy;

    @Column(nullable = false)
    private LocalDateTime createdAt;

    @Column(nullable = false)
    private LocalDateTime updatedAt;

    @PrePersist
    void prePersist() {
        createdAt = LocalDateTime.now();
        updatedAt = createdAt;
    }

    @PreUpdate
    void preUpdate() {
        updatedAt = LocalDateTime.now();
    }
}
