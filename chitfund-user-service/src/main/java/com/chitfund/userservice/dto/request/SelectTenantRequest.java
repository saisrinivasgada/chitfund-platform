package com.chitfund.userservice.dto.request;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class SelectTenantRequest {

    @NotBlank
    private String loginToken;  // pre-scope JWT from step 1

    @NotBlank
    private String tenantId;
}
