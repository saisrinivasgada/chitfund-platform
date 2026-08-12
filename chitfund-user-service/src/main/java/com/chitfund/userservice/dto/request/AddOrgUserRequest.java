package com.chitfund.userservice.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
public class AddOrgUserRequest {

    @NotBlank(message = "Full name is required")
    private String fullName;

    @NotBlank(message = "Phone is required")
    private String phone;

    private String phoneCountryCode = "+91";

    private String email;

    @NotNull(message = "Role is required")
    private String role;  // ADMIN, MANAGER, STAFF

    private String password;
}
