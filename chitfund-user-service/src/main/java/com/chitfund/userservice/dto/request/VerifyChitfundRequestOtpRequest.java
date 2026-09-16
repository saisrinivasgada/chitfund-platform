package com.chitfund.userservice.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import lombok.Data;

@Data
public class VerifyChitfundRequestOtpRequest {
    @NotBlank
    @Pattern(regexp = "^\\d{6}$", message = "Enter the 6-digit OTP")
    private String code;
}
