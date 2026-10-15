package com.chitfund.supportservice.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class AssignTicketRequest {

    @NotBlank
    private String assigneeId;

    @NotBlank(message = "Assignment reason is required")
    @Size(max = 255)
    private String note;
}
