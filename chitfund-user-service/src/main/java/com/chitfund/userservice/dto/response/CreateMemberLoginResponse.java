package com.chitfund.userservice.dto.response;

import lombok.Builder;
import lombok.Data;

import java.util.UUID;

@Data
@Builder
public class CreateMemberLoginResponse {
    private UUID userId;
    private String tempPassword;
}
