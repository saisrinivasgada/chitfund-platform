package com.chitfund.userservice.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import lombok.Data;

@Data
public class ChitfundRequestEmailRecoveryRequest {
    @NotBlank
    private String token;

    @Pattern(regexp = "^\\d{6}$", message = "Enter the 6-digit email OTP")
    private String code;
}
