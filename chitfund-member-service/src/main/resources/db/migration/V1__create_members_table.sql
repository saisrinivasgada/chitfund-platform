-- WHY member-service has its own DB separate from user-service?
-- Not all members have app accounts. An elderly member who pays cash only
-- exists in this table, never in user-service. Keeping them separate means
-- member-service can evolve independently (add KYC fields, bank details)
-- without touching auth logic.
--
-- WHY only aadhaar_last4 and not the full number?
-- Storing full Aadhaar numbers requires UIDAI compliance and encryption at rest.
-- Last 4 digits are enough for verification during cash collection — worker
-- asks "does your Aadhaar end in 7823?" This is standard practice in India.
--
-- user_id is nullable — links to user-service when a member has app access.
-- UNIQUE constraint prevents one user account from being linked to two members.

CREATE TABLE members (
    id                  VARCHAR(36)   NOT NULL,
    full_name           VARCHAR(100)  NOT NULL,
    phone               VARCHAR(15)   NOT NULL,
    email               VARCHAR(100),
    address             TEXT,
    city                VARCHAR(50),
    aadhaar_last4       CHAR(4),
    pan_number          VARCHAR(10),
    bank_name           VARCHAR(100),
    bank_account_number VARCHAR(20),
    bank_ifsc           VARCHAR(11),
    status              VARCHAR(20)   NOT NULL DEFAULT 'ACTIVE',
    user_id             VARCHAR(36),
    notes               TEXT,
    created_by          VARCHAR(36)   NOT NULL,
    created_at          DATETIME(6)   NOT NULL,
    updated_at          DATETIME(6)   NOT NULL,

    PRIMARY KEY (id),
    UNIQUE KEY uk_member_phone  (phone),
    UNIQUE KEY uk_member_user   (user_id),
    INDEX idx_members_status    (status),
    INDEX idx_members_full_name (full_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
