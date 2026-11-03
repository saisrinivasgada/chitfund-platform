package com.chitfund.userservice.service;

public final class OtpCheckOutcome {

    private final OtpCheckResult result;
    private final String otpId;
    private final String message;

    private OtpCheckOutcome(OtpCheckResult result, String otpId, String message) {
        this.result = result;
        this.otpId = otpId;
        this.message = message;
    }

    public static OtpCheckOutcome correct(String otpId) {
        return new OtpCheckOutcome(OtpCheckResult.CORRECT, otpId, null);
    }

    public static OtpCheckOutcome invalid(OtpCheckResult result, String message) {
        return new OtpCheckOutcome(result, null, message);
    }

    public boolean isCorrect() {
        return result == OtpCheckResult.CORRECT;
    }

    public OtpCheckResult getResult() {
        return result;
    }

    public String getOtpId() {
        return otpId;
    }

    public String getMessage() {
        return message;
    }
}
