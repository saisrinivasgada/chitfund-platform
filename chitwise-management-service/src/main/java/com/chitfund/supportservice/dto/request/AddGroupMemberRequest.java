package com.chitfund.supportservice.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import lombok.Data;

@Data
public class AddGroupMemberRequest {

    @NotBlank
    private String userId;

    @NotBlank
    private String userName;

    @NotBlank
    @Pattern(regexp = "^(ADMIN|MANAGER|MEMBER|STAFF)$", message = "role must be one of ADMIN, MANAGER, MEMBER, STAFF")
    private String role;
}
