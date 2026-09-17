package com.chitfund.supportservice.dto.request;

import com.chitfund.supportservice.domain.enums.TicketPriority;
import com.chitfund.supportservice.domain.enums.TicketType;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class CreateHubTicketRequest {

    @NotBlank(message = "Tenant ID is required")
    @Size(max = 36)
    private String tenantId;

    @NotBlank(message = "Tenant name is required")
    @Size(max = 150)
    private String tenantName;

    @NotNull(message = "Ticket type is required")
    private TicketType type;

    @NotNull(message = "Priority is required")
    private TicketPriority priority;

    @NotBlank(message = "Subject is required")
    @Size(min = 5, max = 255, message = "Subject must be 5–255 characters")
    private String subject;

    @Size(max = 5000, message = "Description too long")
    private String description;

    @Size(max = 150)
    private String callerName;

    @Size(max = 100)
    private String callerPhone;

    @Size(max = 150)
    private String callerEmail;
}
