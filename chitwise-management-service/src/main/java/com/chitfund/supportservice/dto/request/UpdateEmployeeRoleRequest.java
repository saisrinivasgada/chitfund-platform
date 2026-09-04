package com.chitfund.supportservice.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import lombok.Data;

@Data
public class UpdateEmployeeRoleRequest {

    @NotBlank
    @Pattern(regexp = "^(SUPER_ADMIN|SUPPORT_AGENT)$", message = "role must be SUPER_ADMIN or SUPPORT_AGENT")
    private String role;
}
