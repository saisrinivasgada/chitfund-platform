package com.chitfund.userservice.dto.request;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class SetupEmailOtpRequest {
    @NotBlank
    private String token;
    @NotBlank @Email
    private String email;
}
