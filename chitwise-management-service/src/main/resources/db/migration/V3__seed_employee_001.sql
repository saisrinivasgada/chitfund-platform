-- Seeds the ChitWise CEO account.
-- Password: Password@1  (bcrypt cost 12)
-- Change immediately in production.
--
-- To regenerate hash:
--   python3 -c "import bcrypt; print(bcrypt.hashpw(b'Password@1', bcrypt.gensalt(12)).decode())"

INSERT INTO employees (
    id, email, full_name, username,
    password_hash, role, is_active,
    invite_token, invite_expires_at, invite_accepted_at,
    created_at, updated_at
)
SELECT
    'EMP-001',
    'saisrinivasgada@gmail.com',
    'Saisrinivas',
    'saisrinivas',
    '$2b$12$gU9KnFzFGGZ8Y9DSRlRuleNIv4cPCDt5oQM4nTHjPVtnRHZw7bpMm',
    'SUPER_ADMIN',
    1,
    NULL, NULL, NOW(),
    NOW(), NOW()
WHERE NOT EXISTS (
    SELECT 1 FROM employees WHERE id = 'EMP-001'
);

INSERT INTO ticket_number_seq (year, last_val)
SELECT YEAR(NOW()), 0
WHERE NOT EXISTS (
    SELECT 1 FROM ticket_number_seq WHERE year = YEAR(NOW())
);
