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
    private List<IntimationItemResponse> items;
}
