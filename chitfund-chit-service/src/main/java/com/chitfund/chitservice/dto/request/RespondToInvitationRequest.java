package com.chitfund.chitservice.dto.request;

import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.util.List;

@Data
public class RespondToInvitationRequest {

    @NotNull(message = "interested field is required")
    private Boolean interested;

    private String reason;

    private Integer spotsRequested;

    private List<Integer> requestedDrawNumbers;
}
