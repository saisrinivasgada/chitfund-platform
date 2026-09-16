package com.chitfund.userservice.domain.entity;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;
import java.util.UUID;

@Entity @Table(name = "identity_operation_executions")
@Getter @Setter @Builder @NoArgsConstructor @AllArgsConstructor
public class IdentityOperationExecution {
    @Id @Column(name = "operation_id", length = 80) private String operationId;
    @Column(name = "request_hash", nullable = false, length = 64) private String requestHash;
    @Column(nullable = false, length = 24) private String status;
    @Column(name = "new_user_id", columnDefinition = "char(36)") private UUID newUserId;
    @Column(name = "result_json", columnDefinition = "TEXT") private String resultJson;
    @Column(name = "last_error", columnDefinition = "TEXT") private String lastError;
    @Column(name = "created_at", nullable = false, updatable = false) private LocalDateTime createdAt;
    @Column(name = "completed_at") private LocalDateTime completedAt;
    @PrePersist void create() { if (createdAt == null) createdAt = LocalDateTime.now(); }
}
