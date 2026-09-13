package com.chitfund.supportservice.dto.request;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class CreatePublicInquiryRequest {
    @NotBlank @Size(max = 100)
    private String name;

    @NotBlank @Email @Size(max = 255)
    private String email;

    @Size(max = 50)
    private String phone;

    @NotBlank @Size(max = 2000)
    private String message;

    @Pattern(regexp = "^(EMAIL|SMS|BOTH)$", message = "preferredContact must be EMAIL, SMS or BOTH")
    private String preferredContact;
}

