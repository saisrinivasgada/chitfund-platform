package com.chitfund.userservice.dto.request;

import com.chitfund.userservice.domain.enums.Role;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import lombok.Data;

@Data
public class MobileLoginRequest {

    @NotBlank
    @Pattern(regexp = "^[0-9]{10}$", message = "Mobile number must be exactly 10 digits")
    private String phone;

    @NotBlank
    private String password;

    // Required when the phone number maps to both a MEMBER and a WORKER/MANAGER account.
    // The frontend calls /auth/mobile-lookup first to check if disambiguation is needed.
    private Role role;
}
