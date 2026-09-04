-- Super admin moves to employees table in chitwise_management DB (support-service).
-- This migration removes the SUPER_ADMIN row from users so auth only works via hub.thechitwise.com.
-- Run AFTER support-service V3 seed (EMP-001) has been applied.

DELETE FROM users WHERE role = 'SUPER_ADMIN';
