package com.chitfund.userservice.domain.enums;

public enum SmsDeliveryStatus {
    GENERATED,              // OTP generated; delivery not yet attempted
    DELIVERED,              // SMS provider confirmed delivery
    DELIVERY_FAILED,        // Provider returned an error
    PROVIDER_NOT_CONFIGURED // No SMS provider is active in this environment
}
