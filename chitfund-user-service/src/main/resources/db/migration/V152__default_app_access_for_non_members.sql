-- All non-MEMBER users (ADMIN, MANAGER, WORKER/STAFF, SUPER_ADMIN) get app access by default.
UPDATE users SET has_app_access = TRUE
WHERE role != 'MEMBER' AND deleted_at IS NULL;
