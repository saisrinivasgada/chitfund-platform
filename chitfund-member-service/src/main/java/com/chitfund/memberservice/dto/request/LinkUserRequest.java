package com.chitfund.memberservice.dto.request;

import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.util.UUID;

@Data
public class LinkUserRequest {

    @NotNull(message = "userId is required")
    private UUID userId;
}
