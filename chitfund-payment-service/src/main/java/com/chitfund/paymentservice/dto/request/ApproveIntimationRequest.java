package com.chitfund.paymentservice.dto.request;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.Digits;
import lombok.Data;

import java.math.BigDecimal;
import java.util.List;

@Data
public class ApproveIntimationRequest {

    @NotEmpty
    @Size(max = 50, message = "An approval can contain at most 50 chit entries")
    @Valid
    private List<ApprovedItemRequest> items;

    @Data
    public static class ApprovedItemRequest {

        @NotNull
        private String itemId;

        @NotNull
        @DecimalMin(value = "1.00", message = "Approved amount must be at least ₹1")
        @Digits(integer = 13, fraction = 2, message = "Approved amount must have at most 13 digits and 2 decimals")
        private BigDecimal approvedAmount;
    }
}
