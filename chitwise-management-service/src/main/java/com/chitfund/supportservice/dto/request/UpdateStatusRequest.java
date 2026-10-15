package com.chitfund.supportservice.dto.request;

import com.chitfund.supportservice.domain.enums.TicketStatus;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class UpdateStatusRequest {

    @NotNull(message = "Status is required")
    private TicketStatus status;

    @NotBlank(message = "Status change reason is required")
    @Size(max = 1000, message = "Status change reason must not exceed 1000 characters")
    private String note;
}
