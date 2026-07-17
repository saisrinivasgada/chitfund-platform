-- Rename role value: WORKER → STAFF
-- WHY: Platform-wide terminology change from "Worker" to "Staff" for clarity.
UPDATE users SET role = 'STAFF' WHERE role = 'WORKER';
