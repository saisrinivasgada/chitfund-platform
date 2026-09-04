package com.chitfund.userservice.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class SubmitSupportTicketRequest {

    @NotBlank(message = "Subject is required")
    @Size(max = 500)
    private String subject;

    @NotBlank(message = "Message is required")
    @Size(max = 2000, message = "Message must be under 2000 characters")
    private String message;

    private String preferredContact; // EMAIL | SMS | BOTH — defaults to EMAIL if absent/invalid
}
