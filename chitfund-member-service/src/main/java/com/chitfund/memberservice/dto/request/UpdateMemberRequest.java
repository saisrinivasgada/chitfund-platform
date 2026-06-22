package com.chitfund.memberservice.dto.request;

import jakarta.validation.constraints.*;
import lombok.Data;

import java.util.UUID;

@Data
public class UpdateMemberRequest {

    @NotBlank
    @Size(min = 2, max = 100)
    private String fullName;

    @Pattern(regexp = "^[0-9]{6,15}$", message = "Enter a valid phone number (6–15 digits)")
    private String phone;

    private String phoneCountryCode;

    @Email
    private String email;

    private String address;

    @Size(max = 50)
    private String city;

    @Pattern(regexp = "^\\d{4}$", message = "Enter only the last 4 digits of Aadhaar")
    private String aadhaarLast4;

    @Pattern(regexp = "^[A-Z]{5}[0-9]{4}[A-Z]$", message = "Enter a valid PAN (e.g. ABCDE1234F)")
    private String panNumber;

    private String bankName;

    @Size(max = 20)
    private String bankAccountNumber;

    @Pattern(regexp = "^[A-Z]{4}0[A-Z0-9]{6}$", message = "Enter a valid IFSC code")
    private String bankIfsc;

    private String notes;

    private UUID referredById;
}
