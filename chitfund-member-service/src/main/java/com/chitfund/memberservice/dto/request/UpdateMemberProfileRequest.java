package com.chitfund.memberservice.dto.request;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class UpdateMemberProfileRequest {

    @Size(min = 2, max = 100, message = "Name must be 2–100 characters")
    private String fullName;

    @Pattern(regexp = "^[0-9]{6,15}$", message = "Enter a valid phone number (6–15 digits)")
    private String phone;

    private String phoneCountryCode;

    @Email(message = "Enter a valid email address")
    private String email;

    private String address;

    @Size(max = 50)
    private String city;
}
