package com.chitfund.paymentservice.domain;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.Filter;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "offline_command_receipts")
@Filter(name = "tenantFilter", condition = "tenant_id = :tenantId")
@Getter @Builder @NoArgsConstructor @AllArgsConstructor
public class OfflineCommandReceipt {
    @Id private UUID id;
    private String tenantId;
    private UUID actorId;
    private String operationId;
    private UUID requestId;
    private String action;
    private String payloadHash;
    private String grantId;
    @Column(columnDefinition = "longtext") private String responseJson;
    private Instant recordedAt;
    private Instant synchronizedAt;
}
