package com.chitfund.userservice.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.HexFormat;

/**
 * Distributed IP-based rate limiter backed by MySQL.
 * Uses an atomic INSERT … ON DUPLICATE KEY UPDATE counter so limits are shared
 * across all service instances — unlike the previous per-JVM Bucket4j cache.
 *
 * The window key encodes the 15-minute bucket: purpose:YYYYMMDDHHMM where MM is
 * floor-rounded to the nearest 15 (i.e. 00, 15, 30, or 45).
 *
 * IPs are hashed with SHA-256 before storage so no PII is persisted.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class RateLimiterService {

    private final JdbcTemplate jdbcTemplate;

    @Value("${app.rate-limit.otp-per-ip-per-15min:5}")
    private int otpPerIpPer15Min;

    @Value("${app.rate-limit.login-per-ip-per-15min:50}")
    private int loginPerIpPer15Min;

    /**
     * Attempt to consume one slot from the OTP/forgot-password IP bucket (5/15min).
     * Returns {@code true} if the request is allowed; {@code false} to rate-limit.
     */
    public boolean tryConsumeForgot(String ip) {
        return tryConsume(ip, "OTP", otpPerIpPer15Min);
    }

    /**
     * Attempt to consume one slot from the login IP bucket (50/15min).
     */
    public boolean tryConsumeLogin(String ip) {
        return tryConsume(ip, "LOGIN", loginPerIpPer15Min);
    }

    private boolean tryConsume(String ip, String purpose, int maxPerWindow) {
        String ipHash    = sha256(ip);
        String windowKey = windowKey(purpose);
        try {
            jdbcTemplate.update(
                    "INSERT INTO otp_ip_rate_limits (ip_hash, window_key, count, created_at) " +
                    "VALUES (?, ?, 1, NOW()) " +
                    "ON DUPLICATE KEY UPDATE count = count + 1",
                    ipHash, windowKey);
            Integer count = jdbcTemplate.queryForObject(
                    "SELECT count FROM otp_ip_rate_limits WHERE ip_hash = ? AND window_key = ?",
                    Integer.class, ipHash, windowKey);
            return count != null && count <= maxPerWindow;
        } catch (DataAccessException e) {
            // Fail open if the rate-limit table is unavailable — do not block all OTPs.
            log.warn("Rate-limit DB check failed for window {}: {}", windowKey, e.getMessage());
            return true;
        }
    }

    private static String windowKey(String purpose) {
        LocalDateTime now = LocalDateTime.now();
        int minute = (now.getMinute() / 15) * 15;
        String ts = now.format(DateTimeFormatter.ofPattern("yyyyMMddHH")) + String.format("%02d", minute);
        return purpose + ":" + ts;
    }

    static String sha256(String value) {
        try {
            byte[] bytes = MessageDigest.getInstance("SHA-256")
                    .digest((value == null ? "" : value).getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(bytes);
        } catch (java.security.NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 not available", e);
        }
    }
}
