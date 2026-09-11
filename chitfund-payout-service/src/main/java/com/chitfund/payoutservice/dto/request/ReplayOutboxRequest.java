package com.chitfund.payoutservice.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class ReplayOutboxRequest {
    @NotBlank(message = "Replay reason is required")
    @Size(max = 500, message = "Replay reason must not exceed 500 characters")
    private String reason;
}
