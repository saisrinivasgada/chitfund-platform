package com.chitfund.chitservice.dto.request;

import com.chitfund.chitservice.domain.enums.ChitStatus;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.time.LocalDate;
import java.util.UUID;

@Data
public class UpdateChitStatusRequest {

    @NotNull(message = "Status is required")
    private ChitStatus status;

    // Optional: admin-supplied start date when activating from DRAFT (only applied if chit has no startDate yet)
    private LocalDate startDate;

    // Populated by controller from JWT, not from request body
    private UUID updatedBy;
}
