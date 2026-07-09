package com.chitfund.chitservice.dto.request;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class UpdateChitNameRequest {

    @NotBlank(message = "Name is required")
    private String name;

    private String description;
}
