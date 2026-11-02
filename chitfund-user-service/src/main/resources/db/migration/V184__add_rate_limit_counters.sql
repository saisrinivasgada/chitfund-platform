-- Distributed IP-based rate limiter.
-- Stores per-minute counters (minute_epoch = floor(unix_epoch / 60)) so that
-- 15-minute sliding-window queries do not span a single fixed bucket boundary.
-- client_hash is HMAC-SHA256(secret, normalized-IP) — never raw IP.
-- Cleanup: expired rows are removed by a scheduled task (> 30 minutes old).
CREATE TABLE IF NOT EXISTS rate_limit_counters (
  client_hash   CHAR(64)    NOT NULL,
  purpose       VARCHAR(30) NOT NULL,
  minute_epoch  BIGINT      NOT NULL,
  count         INT         NOT NULL DEFAULT 0,
  PRIMARY KEY (client_hash, purpose, minute_epoch),
  INDEX idx_minute_epoch (minute_epoch)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
