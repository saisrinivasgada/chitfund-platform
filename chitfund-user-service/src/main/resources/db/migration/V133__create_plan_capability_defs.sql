CREATE TABLE plan_capability_defs (
    `key`       VARCHAR(80)  NOT NULL,
    label       VARCHAR(120) NOT NULL,
    sort_order  INT          NOT NULL DEFAULT 0,
    PRIMARY KEY (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed existing capabilities so they appear in the master list
INSERT INTO plan_capability_defs (`key`, label, sort_order) VALUES
    ('priority_support',   'Priority support', 1),
    ('full_analytics',     'Full analytics',   2);
