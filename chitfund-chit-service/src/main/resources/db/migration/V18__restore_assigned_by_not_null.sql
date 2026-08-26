-- Restore NOT NULL on assigned_by; system auto-close now uses a designated SYSTEM_USER UUID instead of null
-- System UUID: 00000000-0000-0000-0000-000000000001 (never points to a real user)
UPDATE monthly_winners SET assigned_by = '00000000-0000-0000-0000-000000000001' WHERE assigned_by IS NULL;
ALTER TABLE monthly_winners MODIFY COLUMN assigned_by VARCHAR(36) NOT NULL;
