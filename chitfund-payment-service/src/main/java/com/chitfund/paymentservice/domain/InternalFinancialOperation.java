package com.chitfund.paymentservice.domain;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "internal_financial_operations")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class InternalFinancialOperation {
    @Id
    private UUID id;

    @Column(name = "tenant_id", nullable = false, length = 36, updatable = false)
    private String tenantId;

    @Column(name = "operation_type", nullable = false, length = 40, updatable = false)
    private String operationType;

    @Column(name = "request_hash", nullable = false, length = 64,
            columnDefinition = "char(64)", updatable = false)
    private String requestHash;

    @Column(name = "completed_at", nullable = false, updatable = false)
    private LocalDateTime completedAt;
}
