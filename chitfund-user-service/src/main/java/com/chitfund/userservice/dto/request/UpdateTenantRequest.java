package com.chitfund.userservice.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import lombok.Data;

@Data
public class UpdateTenantRequest {

    @NotBlank(message = "Org name is required")
    private String name;

    private String businessRegNumber;

    private String supportPhoneNumber;
}
