ALTER TABLE contact_requests
  ADD COLUMN preferred_contact VARCHAR(10) NOT NULL DEFAULT 'EMAIL' AFTER status,
  ADD COLUMN hold_until        DATETIME    NULL                     AFTER preferred_contact;

UPDATE contact_requests SET status = 'OPEN' WHERE status = 'READ';
