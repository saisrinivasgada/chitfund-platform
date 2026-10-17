package com.chitfund.paymentservice.domain;

import jakarta.persistence.*;
import lombok.*;
import java.time.Instant;
import java.util.UUID;

@Entity @Table(name = "offline_payment_reviews")
@Getter @Setter @Builder @NoArgsConstructor @AllArgsConstructor
public class OfflinePaymentReview {
    @Id private UUID id;
    @Column(name = "tenant_id") private String tenantId;
    @Column(name = "actor_id") private UUID actorId;
    @Column(name = "operation_id") private String operationId;
    @Column(name = "payload_hash") private String payloadHash;
    @Column(name = "request_json", columnDefinition = "longtext") private String requestJson;
    @Column(name = "cash_request_id") private UUID cashRequestId;
    @Column(name = "refund_json", columnDefinition = "longtext") private String refundJson;
    private String reason;
    private String status;
    @Column(name = "submitted_at") private Instant submittedAt;
    @Column(name = "resolved_at") private Instant resolvedAt;
    @Column(name = "resolved_by") private UUID resolvedBy;
    @Column(name = "resolution_reason") private String resolutionReason;
    @Column(name = "receipt_id") private UUID receiptId;
}
