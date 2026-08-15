package com.chitfund.userservice.dto.request;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class SetupAccountRequest {

    @NotBlank
    private String token;       // raw setup token from SMS link

    @NotBlank
    @Size(min = 8, max = 50)
    private String newPassword;

    private String fullName;    // optional — member can set display name here

    @AssertTrue(message = "You must accept the Terms of Service to activate your account")
    private boolean termsAccepted;
}
