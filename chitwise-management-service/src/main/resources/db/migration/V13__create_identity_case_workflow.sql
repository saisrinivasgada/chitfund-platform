ALTER TABLE employees
    ADD COLUMN can_manage_identity_cases BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN platform_owner BOOLEAN NOT NULL DEFAULT FALSE;

-- The original EMP-001 account is the protected owner. Deliberately no public
-- API changes platform_owner; changing it requires an audited operational runbook.
UPDATE employees
SET can_manage_identity_cases = TRUE,
    platform_owner = TRUE
WHERE id = 'EMP-001';

ALTER TABLE support_tickets
    ADD COLUMN account_case_subtype VARCHAR(40) NULL,
    ADD COLUMN subject_member_id VARCHAR(36) NULL,
    ADD COLUMN subject_user_id VARCHAR(36) NULL;

CREATE TABLE identity_cases (
    id                    VARCHAR(36)  NOT NULL,
    ticket_id             VARCHAR(36)  NOT NULL,
    subtype               VARCHAR(40)  NOT NULL,
    tenant_id             VARCHAR(36)  NULL,
    member_id             VARCHAR(36)  NULL,
    subject_user_id       VARCHAR(36)  NULL,
    status                VARCHAR(32)  NOT NULL,
    assigned_employee_id  VARCHAR(36)  NULL,
    proposal_json         TEXT         NULL,
    proposal_reason       TEXT         NULL,
    proposed_at           DATETIME(6)  NULL,
    proposed_by           VARCHAR(36)  NULL,
    decided_at            DATETIME(6)  NULL,
    decided_by            VARCHAR(36)  NULL,
    decision_reason       TEXT         NULL,
    execution_key         VARCHAR(80)  NULL,
    executing_at          DATETIME(6)  NULL,
    execution_result      TEXT         NULL,
    last_error            TEXT         NULL,
    executed_at           DATETIME(6)  NULL,
    version               BIGINT       NOT NULL DEFAULT 0,
    created_at            DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at            DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    UNIQUE KEY uq_identity_case_ticket (ticket_id),
    UNIQUE KEY uq_identity_case_execution_key (execution_key),
    KEY idx_identity_case_status (status, updated_at),
    KEY idx_identity_case_assignee (assigned_employee_id, status),
    CONSTRAINT fk_identity_case_ticket FOREIGN KEY (ticket_id) REFERENCES support_tickets(id)
) ENGINE=InnoDB;

CREATE TABLE identity_case_audit (
    id              VARCHAR(36) NOT NULL,
    identity_case_id VARCHAR(36) NOT NULL,
    action          VARCHAR(40) NOT NULL,
    actor_id        VARCHAR(36) NOT NULL,
    details         TEXT NULL,
    created_at      DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    KEY idx_identity_case_audit (identity_case_id, created_at),
    CONSTRAINT fk_identity_case_audit_case FOREIGN KEY (identity_case_id) REFERENCES identity_cases(id)
) ENGINE=InnoDB;
