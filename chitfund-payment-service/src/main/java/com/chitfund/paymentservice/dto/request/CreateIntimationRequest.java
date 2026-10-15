package com.chitfund.paymentservice.dto.request;

import com.chitfund.paymentservice.domain.enums.PaymentMode;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.Digits;
import lombok.Data;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

@Data
public class CreateIntimationRequest {

    @NotEmpty
    @Size(max = 50, message = "An intimation can contain at most 50 chit entries")
    @Valid
    private List<IntimationItemRequest> items;

    @NotNull
    private PaymentMode paymentMode;

    @Size(max = 100, message = "Payment reference must not exceed 100 characters")
    private String paymentReference;

    @Size(max = 1000, message = "Notes must not exceed 1000 characters")
    private String notes;

    @Data
    public static class IntimationItemRequest {

        @NotNull
        private UUID chitId;

        @NotNull
        @DecimalMin(value = "1.00", message = "Amount must be at least ₹1")
        @Digits(integer = 13, fraction = 2, message = "Amount must have at most 13 digits and 2 decimals")
        private BigDecimal claimedAmount;
    }
}
