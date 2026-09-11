"""
Failure behaviour — Phase 6, against the live stack.

A payment must not depend on anything that is not itself a payment. The stack
these run against has notification, audit and event publishing all pointed at
dead addresses, so every test here executes with those downstreams already
failing. If a collection still succeeds and the ledger is still correct, the
degradation is genuinely graceful rather than merely untested.

This is also where the R2 regression is pinned: failed event delivery must leave
a durable, retryable outbox row that operations can observe and replay.

    pytest tests/e2e/test_failure_resilience.py -v

DESTRUCTIVE — writes financial rows.
"""

from __future__ import annotations

import uuid
import time
from decimal import Decimal

import pytest

pytestmark = pytest.mark.failure


@pytest.fixture
def open_month(api, token):
    admin = token("ADMIN")
    chit_id, member_id = str(uuid.uuid4()), str(uuid.uuid4())
    r = api.as_role("POST", f"{api.payment}/admin/draws/open", admin, json={
        "chitId": chit_id, "monthNumber": 1, "dueDate": "2026-03-01",
        "installmentAmount": 1000, "maxCycles": 12,
        "members": [{"memberId": member_id, "amountDue": 1000}],
    })
    assert r.status_code == 201, r.text[:200]
    return {"chit_id": chit_id, "member_id": member_id, "admin": admin}


class TestDownstreamFailureDoesNotLoseMoney:
    """
    Notification, audit and event publishing are all unreachable in this stack.
    Collection must still work and still be recorded exactly once.
    """

    def test_payment_succeeds_with_every_downstream_dead(self, api, db, open_month):
        r = api.as_role("POST", f"{api.payment}/payments", open_month["admin"],
                        json={"chitId": open_month["chit_id"],
                              "memberId": open_month["member_id"],
                              "amount": 1000, "paymentMode": "UPI"})
        assert r.status_code in (200, 201), (
            f"a payment failed because a notification or audit call failed "
            f"({r.status_code}) — a member's money must never depend on those")

        paid = db.scalar(
            "chitfund_payment",
            "SELECT amount_paid FROM payment_records WHERE chit_id=%s AND member_id=%s",
            (open_month["chit_id"], open_month["member_id"]))
        assert Decimal(str(paid)) == Decimal("1000.00")

    def test_treasury_still_credited_when_events_fail(self, api, db, open_month):
        before = Decimal(str(db.scalar(
            "chitfund_payment",
            "SELECT COALESCE(SUM(amount),0) FROM admin_wallet WHERE entry_type='IN'")))

        api.as_role("POST", f"{api.payment}/payments", open_month["admin"],
                    json={"chitId": open_month["chit_id"],
                          "memberId": open_month["member_id"],
                          "amount": 400, "paymentMode": "CASH"})

        after = Decimal(str(db.scalar(
            "chitfund_payment",
            "SELECT COALESCE(SUM(amount),0) FROM admin_wallet WHERE entry_type='IN'")))
        assert after > before, (
            "money was collected but never reached the treasury while events "
            "were failing — the ledger and the cash would disagree")

    def test_no_partial_write_when_a_downstream_fails(self, api, db, open_month):
        """
        A payment either lands completely or not at all. A batch with no
        allocations, or allocations with no batch, is money the system cannot
        account for.
        """
        api.as_role("POST", f"{api.payment}/payments", open_month["admin"],
                    json={"chitId": open_month["chit_id"],
                          "memberId": open_month["member_id"],
                          "amount": 600, "paymentMode": "UPI"})

        orphan_allocs = db.query(
            "chitfund_payment",
            """SELECT a.id FROM payment_allocations a
               LEFT JOIN payment_batches b ON b.id = a.batch_id
               WHERE b.id IS NULL""")
        assert not list(orphan_allocs), "allocations exist with no parent batch"

        completed_without_allocation = db.query(
            "chitfund_payment",
            """SELECT b.id, b.total_amount FROM payment_batches b
               LEFT JOIN payment_allocations a ON a.batch_id = b.id
               WHERE b.status = 'COMPLETED' AND a.id IS NULL
                 AND b.chit_id = %s""",
            (open_month["chit_id"],))
        # A completed batch with nothing allocated is only legitimate when it all
        # became credit; here the member owed money, so it must have landed.
        assert not list(completed_without_allocation), (
            "a completed payment allocated nothing against an outstanding debt")


class TestVoidUnderFailure:
    def test_void_reverses_fully_with_downstreams_dead(self, api, db, open_month):
        pay = api.as_role("POST", f"{api.payment}/payments", open_month["admin"],
                          json={"chitId": open_month["chit_id"],
                                "memberId": open_month["member_id"],
                                "amount": 1000, "paymentMode": "UPI"})
        batch_id = pay.json()["data"]["id"]

        r = api.as_role("POST", f"{api.payment}/payments/{batch_id}/void",
                        open_month["admin"], json={"reason": "failure-path test"})
        assert r.status_code in (200, 201), r.text[:200]

        row = db.one(
            "chitfund_payment",
            "SELECT status, amount_paid FROM payment_records WHERE chit_id=%s AND member_id=%s",
            (open_month["chit_id"], open_month["member_id"]))
        # The reversal must not be the part that gets skipped when a notification
        # throws — that would leave the member credited for money taken back.
        assert Decimal(str(row["amount_paid"])) == Decimal("0.00")
        assert row["status"] == "OUTSTANDING"


class TestEventDeliveryGap:
    """R2 regression: a downstream outage is visible and retryable."""

    def test_payment_is_durable_while_event_destinations_are_down(self, api, db, open_month):
        api.as_role("POST", f"{api.payment}/payments", open_month["admin"],
                    json={"chitId": open_month["chit_id"],
                          "memberId": open_month["member_id"],
                          "amount": 250, "paymentMode": "UPI"})

        batches = db.query(
            "chitfund_payment",
            "SELECT id, status FROM payment_batches WHERE chit_id=%s",
            (open_month["chit_id"],))
        assert any(b["status"] == "COMPLETED" for b in batches), (
            "the payment did not survive an event-publish failure")

    def test_an_outbox_records_undelivered_events(self, api, db, open_month):
        payment = api.as_role(
            "POST", f"{api.payment}/payments", open_month["admin"],
            headers={"X-Idempotency-Key": str(uuid.uuid4())},
            json={"chitId": open_month["chit_id"],
                  "memberId": open_month["member_id"],
                  "amount": 250, "paymentMode": "UPI"})
        assert payment.status_code == 201, payment.text[:300]
        batch_id = payment.json()["data"]["id"]

        deliveries = list(db.query(
            "chitfund_payment",
            """SELECT delivery_id, event_id, event_type, destination, status,
                      attempts, payload
               FROM event_outbox WHERE aggregate_id=%s""",
            (batch_id,)))
        assert len(deliveries) == 3
        assert len({row["delivery_id"] for row in deliveries}) == 3
        assert len({row["event_id"] for row in deliveries}) == 1
        assert {row["destination"] for row in deliveries} == {
            "chitfund-notification-events",
            "chitfund-audit-events",
            "chitfund-reporting-events",
        }
        assert {row["event_type"] for row in deliveries} == {"PAYMENT_COMPLETED"}
        assert all(row["status"] in {"PENDING", "IN_FLIGHT", "FAILED"}
                   for row in deliveries)

    def test_failed_delivery_can_be_replayed_without_changing_identity(
            self, api, db, token, open_month):
        payment = api.as_role(
            "POST", f"{api.payment}/payments", open_month["admin"],
            headers={"X-Idempotency-Key": str(uuid.uuid4())},
            json={"chitId": open_month["chit_id"],
                  "memberId": open_month["member_id"],
                  "amount": 250, "paymentMode": "UPI"})
        assert payment.status_code == 201, payment.text[:300]
        batch_id = payment.json()["data"]["id"]

        delivery = None
        deadline = time.monotonic() + 12
        while time.monotonic() < deadline:
            delivery = db.one(
                "chitfund_payment",
                """SELECT delivery_id, event_id, payload, status
                   FROM event_outbox
                   WHERE aggregate_id=%s AND status='FAILED'
                   ORDER BY delivery_id LIMIT 1""",
                (batch_id,))
            if delivery:
                break
            time.sleep(0.25)
        assert delivery is not None, "delivery did not exhaust its configured retries"

        other_tenant_admin = token(
            "ADMIN", tenant="20000000-0000-0000-0000-000000000002")
        blocked = api.as_role(
            "POST",
            f"{api.payment}/admin/outbox/{delivery['delivery_id']}/replay",
            other_tenant_admin,
            json={"reason": "must not cross tenant boundary"})
        assert blocked.status_code == 404, blocked.text[:300]

        replayed = api.as_role(
            "POST",
            f"{api.payment}/admin/outbox/{delivery['delivery_id']}/replay",
            open_month["admin"],
            json={"reason": "failure-injection endpoint recovered"})
        assert replayed.status_code == 200, replayed.text[:300]

        unchanged = db.one(
            "chitfund_payment",
            """SELECT event_id, payload FROM event_outbox WHERE delivery_id=%s""",
            (delivery["delivery_id"],))
        assert unchanged["event_id"] == delivery["event_id"]
        assert unchanged["payload"] == delivery["payload"]
        audit = db.one(
            "chitfund_payment",
            """SELECT tenant_id, replayed_by, reason
               FROM event_outbox_replay_audit WHERE delivery_id=%s""",
            (delivery["delivery_id"],))
        assert audit is not None
        assert audit["tenant_id"] == "10000000-0000-0000-0000-000000000001"
        assert audit["reason"] == "failure-injection endpoint recovered"
        assert audit["replayed_by"] == "00000000-0000-0000-0000-0000000000aa"
