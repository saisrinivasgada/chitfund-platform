ALTER TABLE email_reset_otps
    CHANGE COLUMN otp_hash otp_code VARCHAR(10) NOT NULL;
