package com.chitfund.supportservice.dto.response;

import com.chitfund.supportservice.domain.enums.AccountCaseSubtype;
import com.chitfund.supportservice.domain.enums.IdentityCaseStatus;
import lombok.Builder;
import lombok.Data;

import java.time.Instant;

@Data @Builder
public class IdentityCaseResponse {
    private String id;
    private String ticketId;
    private AccountCaseSubtype subtype;
    private String tenantId;
    private String memberId;
    private String subjectUserId;
    private IdentityCaseStatus status;
    private String assignedEmployeeId;
    private String proposalJson;
    private String proposalReason;
    private Instant proposedAt;
    private String proposedBy;
    private Instant decidedAt;
    private String decidedBy;
    private String decisionReason;
    private String lastError;
    private Instant executedAt;
    private Instant createdAt;
    private Instant updatedAt;
}
