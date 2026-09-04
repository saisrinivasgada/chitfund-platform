CREATE TABLE employees (
    id                  VARCHAR(20) PRIMARY KEY,
    email               VARCHAR(255) NOT NULL,
    full_name           VARCHAR(100) NOT NULL,
    username            VARCHAR(50) NOT NULL,
    password_hash       VARCHAR(255),
    role                VARCHAR(30) NOT NULL,
    is_active           TINYINT(1) NOT NULL DEFAULT 1,
    invite_token        VARCHAR(100),
    invite_expires_at   DATETIME(6),
    invite_accepted_at  DATETIME(6),
    created_at          DATETIME(6) NOT NULL,
    updated_at          DATETIME(6) NOT NULL,
    last_login_at       DATETIME(6),
    UNIQUE KEY uq_email (email),
    UNIQUE KEY uq_username (username),
    UNIQUE KEY uq_invite_token (invite_token)
);
