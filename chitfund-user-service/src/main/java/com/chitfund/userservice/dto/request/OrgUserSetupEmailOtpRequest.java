package com.chitfund.userservice.dto.request;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class OrgUserSetupEmailOtpRequest {
    @NotBlank
    private String token;
}
