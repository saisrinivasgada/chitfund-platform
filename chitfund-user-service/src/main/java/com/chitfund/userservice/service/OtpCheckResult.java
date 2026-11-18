package com.chitfund.userservice.service;

public enum OtpCheckResult {
    CORRECT,
    INCORRECT,
    MAX_ATTEMPTS_EXCEEDED,
    EXPIRED_OR_NOT_FOUND
}
