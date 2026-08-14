package com.chitfund.userservice.dto.response;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class ForgotPasswordVerifyOtpResponse {
    private String resetToken;
}
