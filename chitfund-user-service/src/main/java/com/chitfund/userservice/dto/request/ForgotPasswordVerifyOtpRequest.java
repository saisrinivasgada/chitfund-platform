package com.chitfund.userservice.dto.request;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class ForgotPasswordVerifyOtpRequest {
    @NotBlank
    private String userId;

    @NotBlank
    private String code;
}
