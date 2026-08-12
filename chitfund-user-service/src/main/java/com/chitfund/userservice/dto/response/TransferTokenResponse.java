package com.chitfund.userservice.dto.response;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class TransferTokenResponse {
    private String transferToken;   // 30-second one-time token
    private String targetSlug;      // slug of the org to switch to
}
