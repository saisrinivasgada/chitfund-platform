"""Successful SQS delivery and inbox dedupe in the disposable event stack."""

from __future__ import annotations

import os
import time
import uuid

import pytest


if os.getenv("TEST_EVENT_STACK", "").lower() != "true":
    pytest.skip(
        "requires docker-compose.events-test.yml (set TEST_EVENT_STACK=true)",
        allow_module_level=True)

pytestmark = pytest.mark.recon


def _wait_until(description, query, predicate, timeout=30):
    deadline = time.monotonic() + timeout
    value = None
    while time.monotonic() < deadline:
        value = query()
        if predicate(value):
            return value
        time.sleep(0.25)
    pytest.fail(f"timed out waiting for {description}; last value={value!r}")


def test_dual_publish_is_delivered_once_per_consumer(api, db, token):
    admin = token("ADMIN")
    chit_id = str(uuid.uuid4())
    member_id = str(uuid.uuid4())

    opened = api.as_role("POST", f"{api.payment}/admin/draws/open", admin, json={
        "chitId": chit_id,
        "monthNumber": 1,
        "dueDate": "2026-10-01",
        "installmentAmount": "1000.00",
        "maxCycles": 12,
        "members": [{"memberId": member_id, "amountDue": "1000.00"}],
    })
    assert opened.status_code == 201, opened.text[:300]

    created = api.as_role("POST", f"{api.payout}/payouts", admin, json={
        "chitId": chit_id,
        "memberId": member_id,
        "monthNumber": 1,
        "winningAmount": "50000.00",
        "discountAmount": "1000.00",
        "installmentSettlement": "1000.00",
        "crossChitSettlement": "0.00",
        "manualAdjustment": "0.00",
        "collectCurrentMonthInstallment": True,
        "notes": "disposable SQS delivery test",
    })
    assert created.status_code in (200, 201), created.text[:300]
    payout_id = created.json()["data"]["id"]

    outbox = db.query(
        "chitfund_payout",
        """SELECT delivery_id, event_id, destination, status
           FROM event_outbox WHERE aggregate_id=%s ORDER BY destination""",
        (payout_id,))
    assert len(outbox) == 2
    assert len({row["event_id"] for row in outbox}) == 1
    event_id = outbox[0]["event_id"]

    _wait_until(
        "both outbox deliveries to publish",
        lambda: db.scalar(
            "chitfund_payout",
            "SELECT COUNT(*) FROM event_outbox WHERE aggregate_id=%s AND status='PUBLISHED'",
            (payout_id,)),
        lambda count: count == 2)

    # DUAL mode sends the same event once through the legacy path and once via
    # the outbox. Each consumer therefore receives two queue messages, but the
    # stable event_id must produce one inbox claim and one database side effect.
    for schema in ("chitfund_notification", "chitfund_reporting"):
        _wait_until(
            f"{schema} inbox claim",
            lambda schema=schema: db.scalar(
                schema, "SELECT COUNT(*) FROM event_inbox WHERE event_id=%s", (event_id,)),
            lambda count: count == 1)

    notification_count = _wait_until(
        "one notification side effect",
        lambda: db.scalar(
            "chitfund_notification",
            """SELECT COUNT(*) FROM notifications
               WHERE recipient_id=%s AND event_type='WINNER_SELECTED'""",
            (member_id,)),
        lambda count: count == 1)
    reporting_count = _wait_until(
        "one reporting side effect",
        lambda: db.scalar(
            "chitfund_reporting",
            """SELECT COUNT(*) FROM payout_summaries
               WHERE chit_id=%s AND month_number=1""",
            (chit_id,)),
        lambda count: count == 1)

    assert notification_count == 1
    assert reporting_count == 1
