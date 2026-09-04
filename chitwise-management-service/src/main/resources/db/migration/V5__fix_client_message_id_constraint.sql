-- Scope idempotency key to sender — prevents cross-user collision
-- (Security fix: without senderId in the constraint, user A with clientMessageId="X"
--  would cause user B's send with the same clientMessageId to silently return A's message)
ALTER TABLE conversation_messages DROP INDEX uq_client_msg;
ALTER TABLE conversation_messages
    ADD CONSTRAINT uq_client_msg UNIQUE (conversation_id, sender_id, client_message_id);
