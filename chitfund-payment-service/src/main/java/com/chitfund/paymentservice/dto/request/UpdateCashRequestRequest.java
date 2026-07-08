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

    // Set to true to change the assigned worker. workerId=null means unassign.
    private Boolean updateWorker;
    private UUID workerId;

    private String adminNotes;

    private LocalDateTime scheduledFor;
}
