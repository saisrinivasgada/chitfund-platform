package com.chitfund.paymentservice.dto.request;

import jakarta.validation.constraints.DecimalMin;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

@Data
public class UpdateCashRequestRequest {

    @DecimalMin(value = "0.01", message = "Amount must be greater than zero")
    private BigDecimal requestedAmount;

    // Set to true to change the assigned staff. staffId=null means unassign.
    private Boolean updateStaff;
    private UUID staffId;

    private String adminNotes;

    private LocalDateTime scheduledFor;
}
