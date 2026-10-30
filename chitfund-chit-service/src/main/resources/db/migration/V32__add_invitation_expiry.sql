ALTER TABLE chit_invitations
    ADD COLUMN expires_at DATETIME(6) NULL
        COMMENT 'Optional response deadline; NULL remains open until manually closed';
