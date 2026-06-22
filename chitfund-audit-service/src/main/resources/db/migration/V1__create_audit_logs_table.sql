-- WHY append-only? Audit logs are legal/compliance records. Mutating them would
-- defeat the purpose. No updated_at column — records are written once and never touched.
--
-- WHY store before_state and after_state as TEXT (JSON)?
-- Each entity type has a different shape. We can't have 20 foreign columns for every
-- possible field. JSON text is flexible, human-readable, and queryable enough for
-- admin investigation. For structured querying at scale, you'd move to Elasticsearch.
--
-- WHY chit_id as a top-level column (it's also in metadata)?
-- The most common audit query is "show me everything that happened to this chit."
-- Putting chit_id in a proper indexed column makes that query fast without JSON parsing.

CREATE TABLE audit_logs (
    id              VARCHAR(36)     NOT NULL,
    service_name    VARCHAR(50)     NOT NULL,

    entity_type     VARCHAR(50)     NOT NULL,
    entity_id       VARCHAR(36)     NOT NULL,
    chit_id         VARCHAR(36),

    action          VARCHAR(60)     NOT NULL,

    actor_id        VARCHAR(36),
    actor_role      VARCHAR(30),
    actor_ip        VARCHAR(45),

    before_state    TEXT,
    after_state     TEXT,
    metadata        TEXT,

    created_at      DATETIME(6)     NOT NULL,

    PRIMARY KEY (id),
    INDEX idx_audit_entity   (entity_type, entity_id),
    INDEX idx_audit_chit     (chit_id),
    INDEX idx_audit_actor    (actor_id),
    INDEX idx_audit_action   (action),
    INDEX idx_audit_created  (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
