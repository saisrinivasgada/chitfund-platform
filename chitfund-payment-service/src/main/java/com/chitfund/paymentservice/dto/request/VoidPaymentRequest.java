package com.chitfund.paymentservice.dto.request;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class VoidPaymentRequest {
    @NotBlank(message = "A reason is required to void a payment")
    private String reason;
}
