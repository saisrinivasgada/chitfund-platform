"""
Failure behaviour — Phase 6, against the live stack.

A payment must not depend on anything that is not itself a payment. The stack
these run against has notification, audit and event publishing all pointed at
dead addresses, so every test here executes with those downstreams already
failing. If a collection still succeeds and the ledger is still correct, the
degradation is genuinely graceful rather than merely untested.

This is also where risk R2 shows: event publishing is fire-and-forget after
commit, with no outbox. A payment survives a publish failure — which these
prove — but reporting and notification then silently diverge from the ledger,
and nothing reconciles them. That gap is recorded here rather than asserted
away, because it needs a design decision.

    pytest tests/e2e/test_failure_resilience.py -v

DESTRUCTIVE — writes financial rows.
"""

from __future__ import annotations

import uuid
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
    """
    R2, recorded rather than asserted away.

    Events publish after commit with no outbox. The payment is safe — that is
    what the tests above prove — but a failed publish is never retried and
    nothing reconciles the ledger against reporting afterwards.
    """

    def test_payment_is_durable_even_though_events_are_not(self, api, db, open_month):
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

    @pytest.mark.xfail(
        reason="R2: there is no outbox. A publish failure after commit is logged "
               "and dropped, so reporting and notification can diverge from the "
               "ledger with nothing to detect or repair it. Recorded as a known "
               "gap — fixing it means adding a transactional outbox, which is a "
               "design decision rather than a patch.",
        strict=False)
    def test_an_outbox_records_undelivered_events(self, db):
        tables = db.query(
            "chitfund_payment",
            """SELECT TABLE_NAME FROM information_schema.TABLES
               WHERE TABLE_SCHEMA = 'chitfund_payment'
                 AND TABLE_NAME LIKE '%outbox%'""")
        assert list(tables), "no outbox table exists to hold undelivered events"
