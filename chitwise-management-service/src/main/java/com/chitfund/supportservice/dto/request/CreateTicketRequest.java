package com.chitfund.supportservice.dto.request;

import com.chitfund.supportservice.domain.enums.TicketType;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class CreateTicketRequest {

    @NotNull(message = "Ticket type is required")
    private TicketType type;

    @NotBlank(message = "Subject is required")
    @Size(min = 5, max = 255, message = "Subject must be 5–255 characters")
    private String subject;

    @Size(max = 5000, message = "Description too long")
    private String description;
}
