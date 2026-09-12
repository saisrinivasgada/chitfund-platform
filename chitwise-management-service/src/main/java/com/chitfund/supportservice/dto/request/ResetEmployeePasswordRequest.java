package com.chitfund.supportservice.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class ResetEmployeePasswordRequest {

    @NotBlank(message = "Temporary password is required")
    @Size(min = 8, max = 100, message = "Temporary password must be between 8 and 100 characters")
    private String temporaryPassword;
}
