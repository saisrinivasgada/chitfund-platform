package com.chitfund.supportservice.dto.request;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class HubRefreshRequest {
    @NotBlank private String refreshToken;
}

