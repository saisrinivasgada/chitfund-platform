package com.chitfund.paymentservice.dto.request;

import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.util.UUID;

@Data
public class AssignWorkerRequest {

    @NotNull
    private UUID workerId;

    private String adminNotes;
}
