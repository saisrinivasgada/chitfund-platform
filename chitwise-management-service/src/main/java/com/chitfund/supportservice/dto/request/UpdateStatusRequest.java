package com.chitfund.supportservice.dto.request;

import com.chitfund.supportservice.domain.enums.TicketStatus;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class UpdateStatusRequest {

    @NotNull(message = "Status is required")
    private TicketStatus status;

    @Size(max = 1000, message = "Note must not exceed 1000 characters")
    private String note;
}
