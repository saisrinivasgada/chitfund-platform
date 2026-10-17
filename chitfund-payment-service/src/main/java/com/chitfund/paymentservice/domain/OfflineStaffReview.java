package com.chitfund.paymentservice.domain;

import jakarta.persistence.*;
import lombok.*;
import java.time.Instant;
import java.util.UUID;

@Entity @Table(name = "offline_staff_reviews")
@Getter @Setter @Builder @NoArgsConstructor @AllArgsConstructor
public class OfflineStaffReview {
    @Id private UUID id;
    private String tenantId;
    private UUID actorId;
    private String actorRole;
    private String operationId;
    private UUID requestId;
    private String payloadHash;
    @Column(columnDefinition = "longtext") private String requestJson;
    @Column(columnDefinition = "longtext") private String legacyPayloadJson;
    private String legacyPayloadHash;
    private String status;
    private Instant submittedAt;
    private Instant resolvedAt;
    private UUID resolvedBy;
    private String resolutionReason;
    @Column(columnDefinition = "longtext") private String resolutionJson;
}
