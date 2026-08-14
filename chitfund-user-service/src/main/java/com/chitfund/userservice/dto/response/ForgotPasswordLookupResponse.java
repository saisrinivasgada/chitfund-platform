package com.chitfund.userservice.dto.response;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class ForgotPasswordLookupResponse {
    private String userId;
    private String maskedPhone;
    private boolean locked;
    private String role;
}
