-- V3 temporarily supplied the first production tenant while tenant propagation
-- was being introduced. Every caller now has to identify its tenant explicitly;
-- retaining a default could silently file an audit record under the wrong org.
ALTER TABLE audit_logs
    MODIFY COLUMN tenant_id VARCHAR(36) NOT NULL;
