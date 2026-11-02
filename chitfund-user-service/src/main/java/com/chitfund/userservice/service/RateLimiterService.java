package com.chitfund.userservice.service;

import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.HexFormat;

/**
 * Distributed IP-based rate limiter backed by MySQL.
 *
 * Per-minute counters allow accurate 15-minute sliding-window queries that do
 * not suffer from fixed-bucket boundary bursts.
 *
 * IPs are HMAC-SHA256(hmacKey, normalizedIp) — never raw IP. The key is a
 * server-side secret injected via app.rate-limit.hmac-key.
 *
 * Fail-closed: if the DB is unreachable the request is rejected (returns false)
 * to prevent an outage from being exploited as an OTP fire-hose.
 *
 * Separate purposes (send ≠ verify budgets): LOGIN, REG_OTP, REG_OTP_VERIFY,
 * FP_LOOKUP, FP_OTP, FP_OTP_VERIFY, FP_RESET, STAFF_PHONE, STAFF_PHONE_VERIFY,
 * PHONE_CHANGE, PHONE_CHANGE_VERIFY, SUPPORT_NUM, SUPPORT_NUM_VERIFY,
 * ORG_USER_SETUP_OTP, ORG_USER_SETUP_OTP_VERIFY.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class RateLimiterService {

    public enum Purpose {
        LOGIN,
        // Registration OTP
        REG_OTP,
        REG_OTP_VERIFY,
        // Forgot-password (4 independent budgets)
        FP_LOOKUP,
        FP_OTP,
        FP_OTP_VERIFY,
        FP_RESET,
        // Staff / admin phone verification
        STAFF_PHONE,
        STAFF_PHONE_VERIFY,
        // Authenticated phone-change
        PHONE_CHANGE,
        PHONE_CHANGE_VERIFY,
        // Support-number OTP
        SUPPORT_NUM,
        SUPPORT_NUM_VERIFY,
        // Org-user invite setup
        ORG_USER_SETUP_OTP,
        ORG_USER_SETUP_OTP_VERIFY,
    }

    private final JdbcTemplate jdbcTemplate;

    @Value("${app.rate-limit.enabled:true}")
    private boolean enabled;

    @Value("${app.rate-limit.hmac-key:}")
    private String hmacKey;

    @PostConstruct
    void validate() {
        if (enabled && (hmacKey == null || hmacKey.isBlank())) {
            throw new IllegalStateException(
                    "app.rate-limit.hmac-key must be set when rate limiting is enabled. " +
                    "Set RATE_LIMIT_HMAC_KEY in the environment, or set RATE_LIMIT_ENABLED=false " +
                    "to disable rate limiting in non-production environments.");
        }
        if (!enabled) {
            log.warn("Rate limiting is DISABLED (RATE_LIMIT_ENABLED=false). " +
                     "This must never be used in production.");
        }
    }

    @Value("${app.rate-limit.login-per-15min:50}")
    private int loginPer15Min;

    @Value("${app.rate-limit.otp-send-per-15min:5}")
    private int otpSendPer15Min;

    @Value("${app.rate-limit.otp-verify-per-15min:10}")
    private int otpVerifyPer15Min;

    // ── Login ─────────────────────────────────────────────────────────────────

    public boolean tryConsumeLogin(String clientIp) {
        return tryConsume(clientIp, Purpose.LOGIN, loginPer15Min);
    }

    // ── Registration OTP ──────────────────────────────────────────────────────

    public boolean tryConsumeRegOtp(String clientIp) {
        return tryConsume(clientIp, Purpose.REG_OTP, otpSendPer15Min);
    }

    public boolean tryConsumeRegOtpVerify(String clientIp) {
        return tryConsume(clientIp, Purpose.REG_OTP_VERIFY, otpVerifyPer15Min);
    }

    // ── Forgot-password (4 steps, 4 independent budgets) ─────────────────────

    public boolean tryConsumeFpLookup(String clientIp) {
        return tryConsume(clientIp, Purpose.FP_LOOKUP, otpSendPer15Min);
    }

    public boolean tryConsumeFpOtp(String clientIp) {
        return tryConsume(clientIp, Purpose.FP_OTP, otpSendPer15Min);
    }

    public boolean tryConsumeFpOtpVerify(String clientIp) {
        return tryConsume(clientIp, Purpose.FP_OTP_VERIFY, otpVerifyPer15Min);
    }

    public boolean tryConsumeFpReset(String clientIp) {
        return tryConsume(clientIp, Purpose.FP_RESET, otpVerifyPer15Min);
    }

    // ── Staff / admin phone OTP ────────────────────────────────────────────────

    public boolean tryConsumeStaffPhone(String clientIp) {
        return tryConsume(clientIp, Purpose.STAFF_PHONE, otpSendPer15Min);
    }

    public boolean tryConsumeStaffPhoneVerify(String clientIp) {
        return tryConsume(clientIp, Purpose.STAFF_PHONE_VERIFY, otpVerifyPer15Min);
    }

    // ── Phone change (authenticated) ──────────────────────────────────────────

    public boolean tryConsumePhoneChange(String clientIp) {
        return tryConsume(clientIp, Purpose.PHONE_CHANGE, otpSendPer15Min);
    }

    public boolean tryConsumePhoneChangeVerify(String clientIp) {
        return tryConsume(clientIp, Purpose.PHONE_CHANGE_VERIFY, otpVerifyPer15Min);
    }

    // ── Support-number OTP ────────────────────────────────────────────────────

    public boolean tryConsumeSupportNum(String clientIp) {
        return tryConsume(clientIp, Purpose.SUPPORT_NUM, otpSendPer15Min);
    }

    public boolean tryConsumeSupportNumVerify(String clientIp) {
        return tryConsume(clientIp, Purpose.SUPPORT_NUM_VERIFY, otpVerifyPer15Min);
    }

    // ── Org-user invite setup ─────────────────────────────────────────────────

    public boolean tryConsumeOrgUserSetupOtp(String clientIp) {
        return tryConsume(clientIp, Purpose.ORG_USER_SETUP_OTP, otpSendPer15Min);
    }

    public boolean tryConsumeOrgUserSetupOtpVerify(String clientIp) {
        return tryConsume(clientIp, Purpose.ORG_USER_SETUP_OTP_VERIFY, otpVerifyPer15Min);
    }

    // ── Core ─────────────────────────────────────────────────────────────────

    private boolean tryConsume(String clientIp, Purpose purpose, int maxPer15Min) {
        if (!enabled) return true;
        String clientHash = hmacIp(clientIp);
        String purposeName = purpose.name();
        long currentMinute = Instant.now().getEpochSecond() / 60;
        long windowStart   = currentMinute - 14; // 15-minute sliding window (inclusive)
        try {
            jdbcTemplate.update(
                    "INSERT INTO rate_limit_counters (client_hash, purpose, minute_epoch, count) " +
                    "VALUES (?, ?, ?, 1) " +
                    "ON DUPLICATE KEY UPDATE count = count + 1",
                    clientHash, purposeName, currentMinute);
            Integer total = jdbcTemplate.queryForObject(
                    "SELECT COALESCE(SUM(count), 0) FROM rate_limit_counters " +
                    "WHERE client_hash = ? AND purpose = ? AND minute_epoch >= ?",
                    Integer.class, clientHash, purposeName, windowStart);
            boolean allowed = total != null && total <= maxPer15Min;
            if (!allowed) {
                log.warn("Rate limit exceeded purpose={} window=15min", purposeName);
            }
            return allowed;
        } catch (DataAccessException e) {
            // Fail closed — cannot confirm limit status, reject to be safe
            log.error("Rate-limit DB unavailable purpose={}: {}; rejecting (fail-closed)",
                    purposeName, e.getMessage());
            return false;
        }
    }

    // ── Scheduled cleanup ────────────────────────────────────────────────────

    @Scheduled(fixedDelayString = "${app.rate-limit.cleanup-interval-ms:3600000}")
    public void cleanupExpired() {
        long cutoff = Instant.now().getEpochSecond() / 60 - 30;
        try {
            int deleted = jdbcTemplate.update(
                    "DELETE FROM rate_limit_counters WHERE minute_epoch < ?", cutoff);
            if (deleted > 0) {
                log.debug("Rate-limit cleanup: removed {} expired rows", deleted);
            }
        } catch (DataAccessException e) {
            log.warn("Rate-limit cleanup failed: {}", e.getMessage());
        }
    }

    // ── IP hashing ────────────────────────────────────────────────────────────

    String hmacIp(String ip) {
        String normalized = normalizeIp(ip);
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(hmacKey.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            return HexFormat.of().formatHex(mac.doFinal(normalized.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException("HmacSHA256 unavailable", e);
        }
    }

    static String normalizeIp(String ip) {
        if (ip == null) return "unknown";
        String s = ip.trim();
        int scope = s.indexOf('%');
        if (scope > 0) s = s.substring(0, scope);
        if (s.startsWith("::ffff:") || s.startsWith("::FFFF:")) s = s.substring(7);
        return s.toLowerCase();
    }
}
