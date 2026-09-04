package com.chitfund.supportservice.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class SendHubMessageRequest {
    @NotBlank
    @Size(max = 4000)
    private String content;

    @Size(max = 36)
    @Pattern(regexp = "^[0-9a-fA-F\\-]{8,36}$", message = "clientMessageId must be a UUID")
    private String clientMessageId;
}
