package com.chitfund.userservice.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class ApplyDowngradeRequest {
    @NotBlank
    @Size(max = 20)
    private String toPlan;

    @NotBlank
    @Size(max = 500)
    private String reason;

    @NotBlank
    @Size(max = 255)
    private String idempotencyKey;
}
