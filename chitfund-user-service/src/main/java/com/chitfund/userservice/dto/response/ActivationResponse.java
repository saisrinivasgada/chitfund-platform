package com.chitfund.userservice.dto.response;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class ActivationResponse {
    private TenantResponse tenant;
    // Generated admin credentials — shown once to super-admin
    private String adminUsername;
    private String adminTempPassword;
    private String adminUserId;
    private boolean adminAlreadyExisted;
    // Non-null only when APP_DEV_OTP_EXPOSURE_ENABLED=true (staging/dev only, never prod)
    private String devSetupUrl;
}
