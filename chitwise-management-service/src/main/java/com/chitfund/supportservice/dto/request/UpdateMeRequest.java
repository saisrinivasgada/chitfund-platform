package com.chitfund.supportservice.dto.request;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class UpdateMeRequest {
    @Size(max = 200)
    private String fullName;

    @Email
    @Size(max = 200)
    private String email;
}
