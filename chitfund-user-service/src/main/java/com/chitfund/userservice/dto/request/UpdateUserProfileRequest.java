package com.chitfund.userservice.dto.request;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class UpdateUserProfileRequest {

    @Size(min = 2, max = 100, message = "Name must be 2–100 characters")
    private String fullName;

    @Size(min = 3, max = 30, message = "Username must be 3–30 characters")
    @Pattern(regexp = "^[a-zA-Z0-9_.]+$", message = "Username can only contain letters, numbers, _ and .")
    private String username;

    @Email(message = "Enter a valid email address")
    private String email;

    // Phone is intentionally excluded — phone changes require OTP verification
    // via POST /api/users/me/phone/verify-otp which calls UserService.updatePhone() directly.
}
