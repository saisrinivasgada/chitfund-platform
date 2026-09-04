package com.chitfund.supportservice.dto.request;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class StartConversationRequest {
    @NotBlank
    private String memberId;
    @NotBlank
    private String memberName;
}
