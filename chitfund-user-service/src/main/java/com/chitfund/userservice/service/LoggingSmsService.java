package com.chitfund.userservice.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;

@Service
@Slf4j
@ConditionalOnProperty(name = "app.sms.enabled", havingValue = "false", matchIfMissing = true)
public class LoggingSmsService implements SmsService {

    @Override
    public void sendOtp(String phone, String countryCode, String otp) {
        log.info("📱 [DEV OTP] Phone: {}{} → OTP: {}", countryCode, phone, otp);
    }
}
