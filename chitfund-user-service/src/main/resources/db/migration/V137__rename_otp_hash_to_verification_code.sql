ALTER TABLE phone_otps
    CHANGE COLUMN otp_hash verification_code VARCHAR(100) NOT NULL;
