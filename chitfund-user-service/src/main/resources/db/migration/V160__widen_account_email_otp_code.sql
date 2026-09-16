-- Widen verification_code to hold a SHA-256 hex digest (64 chars).
-- The column was originally VARCHAR(10) for a plaintext 6-digit OTP;
-- after OTP hashing was introduced the stored value is a 64-char hex string.
ALTER TABLE account_email_otps
    MODIFY COLUMN verification_code VARCHAR(64) NOT NULL;
