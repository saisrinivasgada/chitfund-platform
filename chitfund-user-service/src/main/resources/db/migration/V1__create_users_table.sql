-- WHY Flyway migrations instead of Hibernate ddl-auto?
-- Versioned, reviewable, rollback-able schema changes — just like git for your DB.
-- ddl-auto=validate means Hibernate checks the schema matches entities but never changes it.
-- Flyway V1, V2... give you a precise history of every schema change.
--
-- INTERVIEW: "We treat schema changes as code. Every DB change is a Flyway migration,
-- reviewed in a PR, tested in staging before production."

CREATE TABLE users (
    id              VARCHAR(36)  NOT NULL,
    username        VARCHAR(50)  NOT NULL,
    email           VARCHAR(255) NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,

    -- Stored as STRING not INT: readable in DB, no magic numbers, easy to grep in logs
    role            VARCHAR(20)  NOT NULL,

    enabled         TINYINT(1)   NOT NULL DEFAULT 1,
    locked          TINYINT(1)   NOT NULL DEFAULT 0,

    -- Tracks consecutive failures for auto-lock (lock after N failures)
    failed_login_attempts INT    NOT NULL DEFAULT 0,

    created_at      DATETIME(6)  NOT NULL,
    updated_at      DATETIME(6)  NOT NULL,

    PRIMARY KEY (id),
    UNIQUE KEY uk_users_username (username),
    UNIQUE KEY uk_users_email    (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- WHY explicit indexes?
-- Login does findByUsername → needs fast lookup.
-- Duplicate check does existsByEmail → needs fast lookup.
-- Without indexes, every login = full table scan.
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_email    ON users(email);
