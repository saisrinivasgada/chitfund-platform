-- Existing accounts remain usable. New organization users explicitly opt into
-- verification_required at creation time and cannot complete login until the
-- entered email has been proven by OTP.
ALTER TABLE users
    ADD COLUMN email_verification_required BOOLEAN NOT NULL DEFAULT FALSE;
