package com.chitfund.userservice.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import lombok.Data;

@Data
public class ForgotPasswordSendOtpRequest {
    @NotBlank
    private String userId;

    @NotBlank
    @Pattern(regexp = "\\d{4}", message = "Enter the last 4 digits of your phone number")
    private String last4;
}
