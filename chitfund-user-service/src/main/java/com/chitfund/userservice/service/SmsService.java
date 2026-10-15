package com.chitfund.userservice.service;

import com.chitfund.userservice.domain.enums.SmsDeliveryStatus;

public interface SmsService {
    SmsDeliveryStatus sendOtp(String phone, String countryCode, String otp);
    boolean isConfigured();
}
