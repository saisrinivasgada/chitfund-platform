package com.chitfund.userservice.dto.request;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class OrgUserSetupCheckOtpRequest {
    @NotBlank
    private String token;
    @NotBlank
    private String emailOtp;
}
