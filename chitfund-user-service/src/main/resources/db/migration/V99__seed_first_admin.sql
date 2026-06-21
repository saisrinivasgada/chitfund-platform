-- Seeds the first ADMIN account if none exists yet.
-- Password: Admin@1234  (bcrypt cost 12)
-- Change immediately after first login — mustChangePassword = 1 forces this.
--
-- To regenerate the hash for a different password:
--   node -e "require('bcryptjs').hash('YourPass',12).then(console.log)"
--   python3 -c "import bcrypt; print(bcrypt.hashpw(b'YourPass', bcrypt.gensalt(12)).decode())"

INSERT INTO users (
    id, username, email, full_name,
    password_hash, role,
    enabled, locked, failed_login_attempts,
    must_change_password,
    created_at, updated_at
)
SELECT
    UUID(),
    'admin',
    'admin@chitfund.local',
    'System Admin',
    '$2a$12$4VIcAq6Vr/ls4lecePivpu/F4lImf303hUd6IyTxrns1rK.IwCBOi',
    'ADMIN',
    1, 0, 0,
    1,
    NOW(), NOW()
WHERE NOT EXISTS (
    SELECT 1 FROM users WHERE role = 'ADMIN'
);
