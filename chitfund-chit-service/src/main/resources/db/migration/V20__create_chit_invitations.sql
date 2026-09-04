CREATE TABLE chit_invitations (
    id              VARCHAR(36)  NOT NULL PRIMARY KEY,
    chit_id         VARCHAR(36)  NOT NULL,
    tenant_id       VARCHAR(36)  NOT NULL,
    message         TEXT,
    status          VARCHAR(20)  NOT NULL DEFAULT 'OPEN',
    created_by      VARCHAR(36)  NOT NULL,
    created_at      DATETIME     NOT NULL,
    updated_at      DATETIME,
    closed_at       DATETIME,
    INDEX idx_invitations_chit   (chit_id, tenant_id),
    INDEX idx_invitations_status (status)
);

CREATE TABLE chit_invitation_recipients (
    invitation_id   VARCHAR(36)  NOT NULL,
    member_id       VARCHAR(36)  NOT NULL,
    PRIMARY KEY (invitation_id, member_id),
    CONSTRAINT fk_inv_recipients_inv FOREIGN KEY (invitation_id) REFERENCES chit_invitations(id)
);

CREATE TABLE chit_invitation_responses (
    id                      VARCHAR(36)  NOT NULL PRIMARY KEY,
    invitation_id           VARCHAR(36)  NOT NULL,
    member_id               VARCHAR(36)  NOT NULL,
    response_status         VARCHAR(30)  NOT NULL DEFAULT 'PENDING',
    reason                  TEXT,
    spots_requested         INT,
    approved_spots          INT,
    requested_draw_numbers  TEXT,
    approved_draw_numbers   TEXT,
    approved                BOOLEAN      NOT NULL DEFAULT FALSE,
    approved_at             DATETIME,
    approved_by             VARCHAR(36),
    responded_at            DATETIME,
    INDEX idx_inv_responses_invitation (invitation_id),
    INDEX idx_inv_responses_member     (member_id),
    UNIQUE KEY uq_inv_member           (invitation_id, member_id),
    CONSTRAINT fk_inv_responses_inv FOREIGN KEY (invitation_id) REFERENCES chit_invitations(id)
);
