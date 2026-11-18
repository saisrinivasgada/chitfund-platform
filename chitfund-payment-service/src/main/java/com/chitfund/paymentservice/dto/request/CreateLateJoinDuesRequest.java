package com.chitfund.paymentservice.dto.request;

import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.util.UUID;

@Data
public class CreateLateJoinDuesRequest {

    @NotNull
    private UUID chitId;

    @NotNull
    private UUID memberId;

    /** Optional actor UUID recorded in audit. */
    private UUID actorId;
}
