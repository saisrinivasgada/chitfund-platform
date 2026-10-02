package com.chitfund.paymentservice.dto.request;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.DecimalMin;
import lombok.Data;

import java.math.BigDecimal;
import java.util.List;

@Data
public class ApproveIntimationRequest {

    @NotEmpty
    @Valid
    private List<ApprovedItemRequest> items;

    @Data
    public static class ApprovedItemRequest {

        @NotNull
        private String itemId;

        @NotNull
        @DecimalMin(value = "1.00", message = "Approved amount must be at least ₹1")
        private BigDecimal approvedAmount;
    }
}
