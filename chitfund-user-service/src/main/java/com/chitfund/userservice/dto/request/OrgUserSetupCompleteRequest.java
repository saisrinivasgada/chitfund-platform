package com.chitfund.userservice.dto.request;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class OrgUserSetupCompleteRequest {
    @NotBlank
    private String token;
    @NotBlank
    private String emailOtp;
    @NotBlank
    private String newPassword;
    private boolean termsAccepted;
}
