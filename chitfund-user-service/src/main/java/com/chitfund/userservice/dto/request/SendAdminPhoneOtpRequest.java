package com.chitfund.userservice.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import lombok.Data;

@Data
public class SendAdminPhoneOtpRequest {
    @NotBlank
    @Pattern(regexp = "\\d{7,15}")
    private String phone;

    private String countryCode = "+91";
}
