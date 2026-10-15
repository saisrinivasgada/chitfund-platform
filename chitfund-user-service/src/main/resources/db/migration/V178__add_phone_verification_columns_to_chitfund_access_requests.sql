-- Persist phone-verification state on each request so that enabling or
-- disabling the SMS provider later cannot retroactively change historical
-- verification status.
--
--  phone_verification_required  -- was SMS configured at creation time?
--  phone_verified_at            -- when phone OTP was successfully completed
--  phone_verification_pending   -- is phone OTP still outstanding?
--
-- Existing rows default to all-false / NULL: they are already active accounts
-- whose setup state is unknown, so we do not retroactively mark them pending.

ALTER TABLE chitfund_access_requests
  ADD COLUMN phone_verification_required  TINYINT(1)  NOT NULL DEFAULT 0
      COMMENT 'SMS was configured at request-creation time and phone OTP was required',
  ADD COLUMN phone_verified_at            DATETIME(6)          DEFAULT NULL
      COMMENT 'When the member successfully completed phone OTP verification',
  ADD COLUMN phone_verification_pending   TINYINT(1)  NOT NULL DEFAULT 0
      COMMENT 'Phone OTP has not yet been verified (cleared when verifyOtp succeeds)';
