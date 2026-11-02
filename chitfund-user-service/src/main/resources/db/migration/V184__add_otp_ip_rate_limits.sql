-- Distributed IP-based OTP rate limiting table.
-- Replaces the in-memory Bucket4j limiter so limits are shared across all service instances.
-- ip_hash: SHA-256 of the client IP to avoid storing PII.
-- window_key: 'OTP:YYYYMMDDHH(mm/15)' — truncated to the current 15-min window.
CREATE TABLE IF NOT EXISTS otp_ip_rate_limits (
  ip_hash   CHAR(64)    NOT NULL,
  window_key VARCHAR(20) NOT NULL,
  count      INT         NOT NULL DEFAULT 0,
  created_at DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (ip_hash, window_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Clean up windows older than 1 hour during each migration run.
-- This is supplemented by a periodic cleanup in the service layer.
DELETE FROM otp_ip_rate_limits WHERE created_at < DATE_SUB(NOW(), INTERVAL 1 HOUR);
