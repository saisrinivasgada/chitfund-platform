package com.chitfund.paymentservice.dto.response;

import com.chitfund.paymentservice.domain.enums.IntimationStatus;
import lombok.Builder;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;

@Data
@Builder
public class IntimationResponse {
    private String id;
    private String memberId;
    private IntimationStatus status;
    private String notes;
    private String rejectReason;
    private String voidReason;
    private LocalDateTime createdAt;
    private LocalDateTime approvedAt;
    private LocalDateTime rejectedAt;
    private LocalDateTime voidedAt;
    /** Who acted on the intimation — user id, display name and role (ADMIN / MANAGER). */
    private String approvedBy;
    private String approvedByName;
    private String approvedByRole;
    private String rejectedBy;
    private String rejectedByName;
    private String rejectedByRole;
    private String voidedBy;
    private String voidedByName;
    private String voidedByRole;
    private List<IntimationItemResponse> items;
}
