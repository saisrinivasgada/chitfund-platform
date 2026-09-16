package com.chitfund.userservice.dto.request;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Pattern;
import lombok.Data;

@Data
public class SetupAccountRequest {

    @NotBlank
    private String token;       // raw setup token from SMS link

    @NotBlank
    @Size(min = 8, max = 50)
    private String newPassword;

    @Size(max = 100)
    private String fullName;    // optional — member can set display name here

    @NotBlank
    @Size(min = 3, max = 50)
    @Pattern(regexp = "^[a-zA-Z0-9._-]+$", message = "Username contains unsupported characters")
    private String username;

    @NotBlank
    @Pattern(regexp = "^\\d{6}$", message = "Enter the 6-digit phone OTP")
    private String phoneOtp;

    @NotBlank(message = "Recovery email is required")
    @Email
    private String email;

    @NotBlank(message = "Email OTP is required")
    @Pattern(regexp = "^\\d{6}$", message = "Enter the 6-digit email OTP")
    private String emailOtp;

    @AssertTrue(message = "You must accept the Terms of Service to activate your account")
    private boolean termsAccepted;
}
