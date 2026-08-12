package com.chitfund.userservice.dto.request;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class RegisterOrgRequest {

    @NotBlank
    @Size(min = 2, max = 100)
    private String orgName;

    @NotBlank
    @Size(min = 3, max = 50)
    @Pattern(regexp = "^[a-z0-9][a-z0-9-]*[a-z0-9]$", message = "Slug must be lowercase letters, digits, and hyphens (no leading/trailing hyphens)")
    private String slug;

    @NotBlank
    @Size(min = 2, max = 50)
    private String adminFullName;

    @NotBlank
    @Size(min = 3, max = 30)
    @Pattern(regexp = "^[a-z0-9][a-z0-9._-]*$", message = "Username: lowercase letters, digits, dots, underscores, hyphens only")
    private String adminUsername;

    @NotBlank
    @Email
    private String adminEmail;

    @NotBlank
    @Size(min = 8, max = 50)
    private String adminPassword;

    @NotBlank
    private String adminPhone;

    @NotBlank
    private String adminPhoneCountryCode;

    private String plan; // BASIC | GROWTH | ENTERPRISE — defaults to BASIC

    private String promoCode; // optional promo or referral code applied at registration
}
