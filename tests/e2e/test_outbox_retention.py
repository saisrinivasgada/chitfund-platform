"""MySQL 8 proof that retention cannot erase unresolved or replay-audited events."""

from __future__ import annotations

import uuid

import pytest

pytestmark = pytest.mark.recon


@pytest.mark.parametrize("schema", ["chitfund_payment", "chitfund_payout"])
def test_retention_deletes_only_old_unreplayed_published_rows(db, schema):
    prefix = uuid.uuid4().hex[:12]
    deliveries = {
        "plain": f"ret-{prefix}-plain",
        "audited": f"ret-{prefix}-audit",
        "pending": f"ret-{prefix}-pending",
        "failed": f"ret-{prefix}-failed",
    }
    try:
        for name, delivery_id in deliveries.items():
            status = "PUBLISHED" if name in {"plain", "audited"} else name.upper()
            db.query(schema, """
                INSERT INTO event_outbox (
                    delivery_id, event_id, tenant_id, aggregate_type, aggregate_id,
                    event_type, destination, payload, status, attempts,
                    available_at, created_at, published_at)
                VALUES (%s, %s, 'retention-test-tenant', 'RETENTION_TEST', %s,
                        'RETENTION_TEST', %s, JSON_OBJECT(), %s, 0,
                        UTC_TIMESTAMP(6) - INTERVAL 200 DAY,
                        UTC_TIMESTAMP(6) - INTERVAL 200 DAY,
                        CASE WHEN %s='PUBLISHED'
                             THEN UTC_TIMESTAMP(6) - INTERVAL 200 DAY ELSE NULL END)
                """, (delivery_id, f"evt-{prefix}-{name}", name,
                      f"retention-test-{name}", status, status))

        db.query(schema, """
            INSERT INTO event_outbox_replay_audit (
                id, delivery_id, tenant_id, replayed_by, reason, replayed_at)
            VALUES (%s, %s, 'retention-test-tenant',
                    '00000000-0000-0000-0000-0000000000aa',
                    'retention integration test', UTC_TIMESTAMP(6))
            """, (f"audit-{prefix}", deliveries["audited"]))

        db.query(schema, """
            DELETE FROM event_outbox
            WHERE status='PUBLISHED'
              AND published_at < UTC_TIMESTAMP(6) - INTERVAL 90 DAY
              AND NOT EXISTS (
                  SELECT 1 FROM event_outbox_replay_audit audit
                  WHERE audit.delivery_id=event_outbox.delivery_id)
            ORDER BY published_at, delivery_id
            LIMIT 1000
            """)

        remaining = {row["delivery_id"] for row in db.query(
            schema,
            "SELECT delivery_id FROM event_outbox WHERE delivery_id IN (%s, %s, %s, %s)",
            tuple(deliveries.values()))}
        assert deliveries["plain"] not in remaining
        assert remaining == {
            deliveries["audited"], deliveries["pending"], deliveries["failed"]}
    finally:
        db.query(schema,
                 "DELETE FROM event_outbox_replay_audit WHERE id=%s",
                 (f"audit-{prefix}",))
        db.query(schema,
                 "DELETE FROM event_outbox WHERE event_id LIKE %s",
                 (f"evt-{prefix}-%",))
