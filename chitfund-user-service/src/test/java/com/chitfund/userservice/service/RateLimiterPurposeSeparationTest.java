package com.chitfund.userservice.service;

import org.junit.jupiter.api.Test;

import java.lang.reflect.Method;
import java.util.Arrays;
import java.util.Set;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Regression guard: every OTP operation must have its own independent Purpose bucket
 * (send ≠ verify, and no two flows share the same value).
 *
 * These tests are intentionally structural/reflective so they catch accidental
 * enum renames, merges, or method removals without requiring a running DB.
 */
class RateLimiterPurposeSeparationTest {

    // ── Purpose enum: required values must all exist ─────────────────────────

    @Test
    void purposeEnumContainsAllRequiredBuckets() {
        Set<String> purposes = Arrays.stream(RateLimiterService.Purpose.values())
                .map(Enum::name)
                .collect(Collectors.toSet());

        // Login
        assertThat(purposes).contains("LOGIN");
        // Registration OTP — send and verify are separate
        assertThat(purposes).contains("REG_OTP", "REG_OTP_VERIFY");
        // Forgot-password — 4 independent steps
        assertThat(purposes).contains("FP_LOOKUP", "FP_OTP", "FP_OTP_VERIFY", "FP_RESET");
        // Staff phone — send and verify separate
        assertThat(purposes).contains("STAFF_PHONE", "STAFF_PHONE_VERIFY");
        // Authenticated phone change — send and verify separate
        assertThat(purposes).contains("PHONE_CHANGE", "PHONE_CHANGE_VERIFY");
        // Support-number — send and verify separate
        assertThat(purposes).contains("SUPPORT_NUM", "SUPPORT_NUM_VERIFY");
        // Org-user invite setup — send and verify separate
        assertThat(purposes).contains("ORG_USER_SETUP_OTP", "ORG_USER_SETUP_OTP_VERIFY");
    }

    @Test
    void sendAndVerifyBucketsAreDistinct() {
        // Verify there are no two purposes whose names are only distinguished by "_VERIFY" suffix
        // that share the same ordinal (i.e. they must be different enum values)
        var fp_otp = RateLimiterService.Purpose.FP_OTP;
        var fp_otp_verify = RateLimiterService.Purpose.FP_OTP_VERIFY;
        assertThat(fp_otp).isNotEqualTo(fp_otp_verify);

        var reg_otp = RateLimiterService.Purpose.REG_OTP;
        var reg_otp_verify = RateLimiterService.Purpose.REG_OTP_VERIFY;
        assertThat(reg_otp).isNotEqualTo(reg_otp_verify);
    }

    // ── tryConsumeForgot must NOT exist — it was the shared bucket that mixed flows ──

    @Test
    void tryConsumeForgotHasBeenRemoved() {
        boolean methodExists = Arrays.stream(RateLimiterService.class.getMethods())
                .map(Method::getName)
                .anyMatch(n -> n.equals("tryConsumeForgot"));
        assertThat(methodExists)
                .as("tryConsumeForgot must be removed — it was a shared FP bucket that also " +
                    "incorrectly rate-limited REG_OTP, STAFF_PHONE, PHONE_CHANGE, and SUPPORT_NUM sends")
                .isFalse();
    }

    // ── Each public tryConsume* method must map to a distinct Purpose ─────────

    @Test
    void allTryConsumeMethodsExist() {
        Set<String> methodNames = Arrays.stream(RateLimiterService.class.getMethods())
                .map(Method::getName)
                .collect(Collectors.toSet());

        assertThat(methodNames).contains(
                "tryConsumeLogin",
                "tryConsumeRegOtp",
                "tryConsumeRegOtpVerify",
                "tryConsumeFpLookup",
                "tryConsumeFpOtp",
                "tryConsumeFpOtpVerify",
                "tryConsumeFpReset",
                "tryConsumeStaffPhone",
                "tryConsumeStaffPhoneVerify",
                "tryConsumePhoneChange",
                "tryConsumePhoneChangeVerify",
                "tryConsumeSupportNum",
                "tryConsumeSupportNumVerify",
                "tryConsumeOrgUserSetupOtp",
                "tryConsumeOrgUserSetupOtpVerify"
        );
    }

    // ── IP normalisation is still stable (belt-and-suspenders) ───────────────

    @Test
    void normalizeIpStillStripsIpv4MappedPrefix() {
        assertThat(RateLimiterService.normalizeIp("::ffff:10.0.0.1")).isEqualTo("10.0.0.1");
    }

    @Test
    void normalizeIpNullReturnsUnknown() {
        assertThat(RateLimiterService.normalizeIp(null)).isEqualTo("unknown");
    }
}
