package com.chitfund.payoutservice.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class CancelPayoutRequest {

    @NotBlank
    @Size(min = 5, max = 500, message = "Cancellation reason must be between 5 and 500 characters")
    private String reason;
}
