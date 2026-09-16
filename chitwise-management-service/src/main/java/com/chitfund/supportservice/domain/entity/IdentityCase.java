package com.chitfund.supportservice.domain.entity;

import com.chitfund.supportservice.domain.enums.AccountCaseSubtype;
import com.chitfund.supportservice.domain.enums.IdentityCaseStatus;
import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;

@Entity
@Table(name = "identity_cases")
@Getter @Setter @Builder @NoArgsConstructor @AllArgsConstructor
public class IdentityCase {
    @Id private String id;
    @Column(name = "ticket_id", nullable = false, unique = true) private String ticketId;
    @Enumerated(EnumType.STRING) @Column(nullable = false) private AccountCaseSubtype subtype;
    @Column(name = "tenant_id") private String tenantId;
    @Column(name = "member_id") private String memberId;
    @Column(name = "subject_user_id") private String subjectUserId;
    @Enumerated(EnumType.STRING) @Column(nullable = false) private IdentityCaseStatus status;
    @Column(name = "assigned_employee_id") private String assignedEmployeeId;
    @Column(name = "proposal_json", columnDefinition = "TEXT") private String proposalJson;
    @Column(name = "proposal_reason", columnDefinition = "TEXT") private String proposalReason;
    @Column(name = "proposed_at") private Instant proposedAt;
    @Column(name = "proposed_by") private String proposedBy;
    @Column(name = "decided_at") private Instant decidedAt;
    @Column(name = "decided_by") private String decidedBy;
    @Column(name = "decision_reason", columnDefinition = "TEXT") private String decisionReason;
    @Column(name = "execution_key", unique = true) private String executionKey;
    @Column(name = "executing_at") private Instant executingAt;
    @Column(name = "execution_result", columnDefinition = "TEXT") private String executionResult;
    @Column(name = "last_error", columnDefinition = "TEXT") private String lastError;
    @Column(name = "executed_at") private Instant executedAt;
    @Version private long version;
    @Column(name = "created_at", nullable = false, updatable = false) private Instant createdAt;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt;

    @PrePersist void create() { Instant now = Instant.now(); if (createdAt == null) createdAt = now; updatedAt = now; }
    @PreUpdate void update() { updatedAt = Instant.now(); }
}
