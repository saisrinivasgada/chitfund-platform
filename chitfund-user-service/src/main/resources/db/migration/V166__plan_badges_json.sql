-- Replace the two single-badge columns with a JSON array column that supports
-- multiple badges per plan, each with its own text, color, and enabled flag.
-- Shape: [{"text":"🔥 HOT DEAL","color":"#D4A017","enabled":true}, ...]
ALTER TABLE plan_limits
    DROP  COLUMN badge_text,
    DROP  COLUMN badge_enabled,
    ADD   COLUMN badges TEXT NULL AFTER global_discount_pct;
