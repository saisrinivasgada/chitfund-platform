package com.chitfund.userservice.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;
import org.springframework.beans.factory.annotation.Value;

@Service
@Slf4j
@ConditionalOnProperty(name = "app.sms.enabled", havingValue = "false", matchIfMissing = true)
public class LoggingSmsService implements SmsService {

    @Value("${app.otp.logging-enabled:false}")
    private boolean otpLoggingEnabled;

    @Override
    public void sendOtp(String phone, String countryCode, String otp) {
        if (otpLoggingEnabled) {
            log.info("[LOCAL-TEST OTP] Phone ending {} -> OTP: {}", maskedSuffix(phone), otp);
        } else {
            log.debug("SMS delivery is disabled; OTP was not emitted to logs");
        }
    }

    private String maskedSuffix(String phone) {
        return phone != null && phone.length() >= 4 ? phone.substring(phone.length() - 4) : "****";
    }
}
