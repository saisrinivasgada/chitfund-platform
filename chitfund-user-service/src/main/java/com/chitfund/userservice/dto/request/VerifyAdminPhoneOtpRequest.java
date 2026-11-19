package com.chitfund.userservice.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import lombok.Data;

@Data
public class VerifyAdminPhoneOtpRequest {
    @NotBlank
    @Pattern(regexp = "\\d{7,15}")
    private String phone;

    private String countryCode = "+91";

    @NotBlank
    @Pattern(regexp = "\\d{4,8}")
    private String otp;
}
