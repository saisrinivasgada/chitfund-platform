package com.chitfund.supportservice.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class AssignTicketRequest {

    @NotBlank
    private String assigneeId;

    @Size(max = 255)
    private String note;
}
