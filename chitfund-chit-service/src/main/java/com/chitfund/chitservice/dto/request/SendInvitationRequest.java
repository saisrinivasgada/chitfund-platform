package com.chitfund.chitservice.dto.request;

import jakarta.validation.constraints.NotEmpty;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@Data
public class SendInvitationRequest {

    @NotEmpty(message = "At least one member must be selected")
    private List<UUID> memberIds;

    private String message;

    /** Optional expiry. A null value leaves the invitation open until an admin closes it. */
    private LocalDateTime expiresAt;
}
