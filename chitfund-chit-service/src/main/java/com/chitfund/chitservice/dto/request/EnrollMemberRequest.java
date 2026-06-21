package com.chitfund.chitservice.dto.request;

import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.util.UUID;

@Data
public class EnrollMemberRequest {

    @NotNull(message = "Member ID is required")
    private UUID memberId;
}
