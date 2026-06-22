-- Add country code for international phone numbers.
-- Default '+91' keeps all existing Indian members intact.
ALTER TABLE members ADD COLUMN phone_country_code VARCHAR(6) NOT NULL DEFAULT '+91' AFTER phone;
