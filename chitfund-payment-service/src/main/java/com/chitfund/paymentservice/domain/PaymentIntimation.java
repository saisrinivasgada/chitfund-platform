package com.chitfund.paymentservice.domain;

import com.chitfund.paymentservice.domain.enums.IntimationStatus;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.Filter;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Filter(name = "tenantFilter", condition = "tenant_id = :tenantId")
@Entity
@Table(name = "payment_intimations")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PaymentIntimation {

    @Id
    @Column(length = 36)
    private String id;

    @Column(nullable = false, length = 36)
    private String tenantId;

    @Column(nullable = false, length = 36)
    private String memberId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, columnDefinition = "varchar(20)")
    private IntimationStatus status;

    @Column(columnDefinition = "text")
    private String notes;

    @Column(columnDefinition = "text")
    private String rejectReason;

    @Column(columnDefinition = "text")
    private String voidReason;

    @Column(length = 36)
    private String submittedBy;

    @Column(length = 36)
    private String approvedBy;

    @Column(length = 36)
    private String rejectedBy;

    @Column(length = 36)
    private String voidedBy;

    private LocalDateTime approvedAt;
    private LocalDateTime rejectedAt;
    private LocalDateTime voidedAt;

    @Column(nullable = false)
    private LocalDateTime createdAt;

    @Column(nullable = false)
    private LocalDateTime updatedAt;

    @OneToMany(mappedBy = "intimation", cascade = CascadeType.ALL, fetch = FetchType.EAGER, orphanRemoval = true)
    @Builder.Default
    private List<PaymentIntimationItem> items = new ArrayList<>();

    @PrePersist
    void prePersist() {
        if (id == null) id = UUID.randomUUID().toString();
        if (status == null) status = IntimationStatus.PENDING;
        createdAt = LocalDateTime.now();
        updatedAt = createdAt;
    }

    @PreUpdate
    void preUpdate() {
        updatedAt = LocalDateTime.now();
    }
}
