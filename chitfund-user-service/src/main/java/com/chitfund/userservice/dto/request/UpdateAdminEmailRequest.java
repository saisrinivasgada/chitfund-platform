package com.chitfund.userservice.dto.request;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class UpdateAdminEmailRequest {
    @NotBlank
    @Email
    private String email;
}
