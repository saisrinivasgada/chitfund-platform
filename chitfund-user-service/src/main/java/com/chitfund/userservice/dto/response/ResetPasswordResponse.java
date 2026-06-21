package com.chitfund.userservice.dto.response;

import lombok.Builder;
import lombok.Data;

import java.util.UUID;

@Data
@Builder
public class ResetPasswordResponse {
    private UUID userId;
    private String username;
    private String tempPassword;
}
