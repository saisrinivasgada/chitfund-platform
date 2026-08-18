package com.chitfund.userservice.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class CreateCapabilityDefRequest {
    @NotBlank
    @Size(max = 120)
    private String label;
}
