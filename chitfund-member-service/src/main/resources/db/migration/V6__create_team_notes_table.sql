CREATE TABLE IF NOT EXISTS team_notes (
    id          CHAR(36)     NOT NULL PRIMARY KEY,
    author_id   CHAR(36)     NOT NULL,
    author_name VARCHAR(255) NOT NULL,
    author_role VARCHAR(50)  NOT NULL,
    text        TEXT,
    visibility  VARCHAR(20)  NOT NULL DEFAULT 'PRIVATE',
    created_at  DATETIME     NOT NULL,
    updated_at  DATETIME
);

CREATE INDEX idx_team_notes_author ON team_notes (author_id);
CREATE INDEX idx_team_notes_visibility ON team_notes (visibility);
