package com.chitfund.userservice.service;

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
 * Separate purposes: LOGIN, REG_OTP, FP_OTP, STAFF_PHONE, OTP_VERIFY,
 * ORG_USER_SETUP_OTP. Verification attempts do NOT share a budget with sends.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class RateLimiterService {

    public enum Purpose {
        LOGIN,
        REG_OTP,
        FP_OTP,
        STAFF_PHONE,
        OTP_VERIFY,
        ORG_USER_SETUP_OTP,
    }

    private final JdbcTemplate jdbcTemplate;

    @Value("${app.rate-limit.hmac-key}")
    private String hmacKey;

    @Value("${app.rate-limit.login-per-15min:50}")
    private int loginPer15Min;

    @Value("${app.rate-limit.otp-send-per-15min:5}")
    private int otpSendPer15Min;

    @Value("${app.rate-limit.otp-verify-per-15min:10}")
    private int otpVerifyPer15Min;

    public boolean tryConsumeLogin(String clientIp) {
        return tryConsume(clientIp, Purpose.LOGIN, loginPer15Min);
    }

    public boolean tryConsumeRegOtp(String clientIp) {
        return tryConsume(clientIp, Purpose.REG_OTP, otpSendPer15Min);
    }

    public boolean tryConsumeForgot(String clientIp) {
        return tryConsume(clientIp, Purpose.FP_OTP, otpSendPer15Min);
    }

    public boolean tryConsumeStaffPhone(String clientIp) {
        return tryConsume(clientIp, Purpose.STAFF_PHONE, otpSendPer15Min);
    }

    public boolean tryConsumeOtpVerify(String clientIp) {
        return tryConsume(clientIp, Purpose.OTP_VERIFY, otpVerifyPer15Min);
    }

    public boolean tryConsumeOrgUserSetupOtp(String clientIp) {
        return tryConsume(clientIp, Purpose.ORG_USER_SETUP_OTP, otpSendPer15Min);
    }

    // ── Core ─────────────────────────────────────────────────────────────────

    private boolean tryConsume(String clientIp, Purpose purpose, int maxPer15Min) {
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
