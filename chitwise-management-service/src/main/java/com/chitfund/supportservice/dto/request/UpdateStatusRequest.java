package com.chitfund.supportservice.dto.request;

import com.chitfund.supportservice.domain.enums.TicketStatus;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
public class UpdateStatusRequest {

    @NotNull(message = "Status is required")
    private TicketStatus status;

    private String note;
}
