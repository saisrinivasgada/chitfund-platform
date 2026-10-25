-- The pending pointer commits with the durable command. It freezes dependent
-- schedule writes until the payment receipt and the local shift are acknowledged.
ALTER TABLE chits ADD COLUMN schedule_sync_command_id VARCHAR(36) NULL;
ALTER TABLE chit_lifecycle_commands ADD COLUMN payload_json LONGTEXT NULL;
