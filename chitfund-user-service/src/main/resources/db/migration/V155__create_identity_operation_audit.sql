CREATE TABLE identity_operation_executions (
    operation_id   VARCHAR(80)  NOT NULL,
    request_hash   CHAR(64)     NOT NULL,
    status         VARCHAR(24)  NOT NULL,
    new_user_id    CHAR(36)     NULL,
    result_json    TEXT         NULL,
    last_error     TEXT         NULL,
    created_at     DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    completed_at   DATETIME(6)  NULL,
    PRIMARY KEY (operation_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE retired_phone_identities (
    id             CHAR(36)    NOT NULL,
    operation_id   VARCHAR(80) NOT NULL,
    user_id        CHAR(36)    NOT NULL,
    phone_hash     CHAR(64)    NOT NULL,
    country_code   VARCHAR(10) NULL,
    retired_at     DATETIME(6) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_retired_phone_operation (operation_id),
    KEY idx_retired_phone_hash (phone_hash),
    KEY idx_retired_phone_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
