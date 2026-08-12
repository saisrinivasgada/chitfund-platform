package com.chitfund.userservice.dto.response;

import lombok.Builder;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@Builder
public class ProxyTokenResponse {
    private String token;
    private String proxyUserId;
    private String proxyUsername;
    private String proxyRole;
    private String tenantId;
    private String tenantSlug;
    private LocalDateTime planExpiresAt;
}
