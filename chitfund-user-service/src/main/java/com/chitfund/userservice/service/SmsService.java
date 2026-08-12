package com.chitfund.userservice.service;

public interface SmsService {
    void sendOtp(String phone, String countryCode, String otp);
}
