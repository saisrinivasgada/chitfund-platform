package com.chitfund.userservice.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import lombok.Data;

@Data
public class UpdateTenantRequest {

    @NotBlank(message = "Org name is required")
    private String name;

    @Pattern(regexp = "^[a-z0-9-]{2,30}$", message = "Slug must be 2-30 lowercase letters, digits, or hyphens")
    private String slug;

    private String businessRegNumber;

    private String supportPhoneNumber;
}
