package com.chitfund.userservice.dto.request;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class VerifyLoginOtpRequest {
    @NotBlank
    private String otpToken;

    @NotBlank
    private String code;
}
