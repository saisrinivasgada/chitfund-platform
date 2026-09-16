package com.chitfund.supportservice.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class IdentityCaseDecisionRequest {
    @NotBlank @Size(max = 2000)
    private String reason;
}
