-- Plan badge sticker: super-admin can attach custom promotional text (e.g. "🔥 HOT DEAL", "SALE")
-- to any plan with an on/off toggle. Shown on landing page and registration plan cards.
ALTER TABLE plan_limits
    ADD COLUMN badge_text    VARCHAR(80)    NULL          AFTER global_discount_pct,
    ADD COLUMN badge_enabled TINYINT(1) NOT NULL DEFAULT 0 AFTER badge_text;
