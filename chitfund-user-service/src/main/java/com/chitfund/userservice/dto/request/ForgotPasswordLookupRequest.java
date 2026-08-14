package com.chitfund.userservice.dto.request;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class ForgotPasswordLookupRequest {
    @NotBlank(message = "Username or phone number is required")
    private String usernameOrPhone;
}
