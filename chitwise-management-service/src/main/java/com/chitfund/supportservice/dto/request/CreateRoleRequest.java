package com.chitfund.supportservice.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.util.Set;

@Data
public class CreateRoleRequest {
    @NotBlank
    @Size(max = 100)
    private String name;

    @Size(max = 500)
    private String description;

    private Set<String> permissions;
}
