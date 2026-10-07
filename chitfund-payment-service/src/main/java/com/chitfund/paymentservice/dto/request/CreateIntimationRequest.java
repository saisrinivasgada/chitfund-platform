package com.chitfund.paymentservice.dto.request;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.DecimalMin;
import lombok.Data;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

@Data
public class CreateIntimationRequest {

    @NotEmpty
    @Valid
    private List<IntimationItemRequest> items;

    private String notes;

    @Data
    public static class IntimationItemRequest {

        @NotNull
        private UUID chitId;

        @NotNull
        @DecimalMin(value = "1.00", message = "Amount must be at least ₹1")
        private BigDecimal claimedAmount;
    }
}
