package com.chitfund.supportservice.dto.request;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class InviteEmployeeRequest {

    @NotBlank
    @Size(max = 100)
    private String fullName;

    @NotBlank
    @Email
    private String email;

    @NotBlank
    @Pattern(regexp = "^(SUPER_ADMIN|SUPPORT_AGENT)$", message = "role must be SUPER_ADMIN or SUPPORT_AGENT")
    private String role;
}
