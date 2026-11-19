package com.chitfund.userservice.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class UpdateAdminNameRequest {
    @NotBlank
    @Size(max = 100)
    private String fullName;
}
