package com.chitfund.userservice.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class LockUserRequest {
    @NotBlank(message = "A reason is required for locking or unlocking an account")
    @Size(min = 5, max = 500, message = "Reason must be between 5 and 500 characters")
    private String reason;
}
