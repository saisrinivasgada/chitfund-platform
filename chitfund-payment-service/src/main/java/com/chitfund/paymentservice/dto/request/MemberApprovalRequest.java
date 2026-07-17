package com.chitfund.paymentservice.dto.request;

import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
public class MemberApprovalRequest {
    @NotNull
    private Boolean approved;
    private String reason;
}
