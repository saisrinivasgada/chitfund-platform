"""
Cross-service payout reversal — Phase 4, risk R1 in the plan.

This is the path no unit test can reach. Voiding a payout in payout-service
calls payment-service over HTTP, **after its own transaction has committed**, to
revert the installments that were withheld from the winner. There is no
distributed transaction: if that second call fails, the payout is VOIDED while
the member's installments stay marked PAYOUT_DEDUCTED, and the only trace is a
log line.

Mocks cannot show this, because a mocked client always succeeds. Here both
services are real and the money is checked on both sides of the boundary.

The invariant: after create → deduct → void, every affected installment must be
owed again, and the payout must not still be claiming to have settled it.

    pytest tests/e2e/test_payout_reversal_cross_service.py -v

DESTRUCTIVE — writes financial rows in two services.
"""

from __future__ import annotations

import uuid
import time
from decimal import Decimal

import pytest

pytestmark = pytest.mark.void


@pytest.fixture
def winner(api, token, active_chit, member_factory):
    """A member with one open, unpaid installment of 1,000."""
    admin = token("ADMIN")
    member_id = member_factory(admin)
    chit_id = active_chit(admin, [member_id])

    r = api.as_role("POST", f"{api.payment}/admin/draws/open", admin, json={
        "chitId": chit_id, "monthNumber": 1, "dueDate": "2026-03-01",
        "installmentAmount": 1000, "maxCycles": 12,
        "members": [{"memberId": member_id, "amountDue": 1000}],
    })
    assert r.status_code == 201, f"draw setup failed: {r.text[:200]}"

    assigned = api.as_role(
        "POST", f"{api.chit}/api/chits/{chit_id}/winners", admin,
        json={"monthNumber": 1, "winnerId": member_id,
              "winningAmount": 50000, "discountAmount": 1000})
    assert assigned.status_code == 201, assigned.text[:300]
    return {"chit_id": chit_id, "member_id": member_id, "admin": admin}


def _record(db, chit_id, member_id):
    return db.one(
        "chitfund_payment",
        """SELECT status, amount_due, amount_paid, settled_by_payout_id
           FROM payment_records WHERE chit_id=%s AND member_id=%s""",
        (chit_id, member_id))


def _payout_row(db, payout_id):
    return db.one("chitfund_payout",
                  "SELECT status, net_payout_amount, disbursed_amount FROM payouts WHERE id=%s",
                  (payout_id,))


def _wait_financial_sync(db, payout_id, timeout=20):
    deadline = time.monotonic() + timeout
    rows = []
    while time.monotonic() < deadline:
        rows = list(db.query(
            "chitfund_payout",
            """SELECT command_type, status, sequence_no FROM payout_financial_commands
               WHERE payout_id=%s ORDER BY sequence_no""",
            (payout_id,)))
        if rows and all(row["status"] == "COMPLETED" for row in rows):
            return rows
        time.sleep(0.25)
    pytest.fail(f"payout financial commands did not complete: {rows!r}")


def _create_payout(api, winner, *, winning="50000", discount="1000",
                   installment_settlement="1000"):
    """
    Creates a payout whose discount withholds the member's current installment —
    the case that makes payment-service mark the record PAYOUT_DEDUCTED.
    """
    return api.as_role(
        "POST", f"{api.payout}/payouts", winner["admin"],
        headers={"X-Idempotency-Key": str(uuid.uuid4())}, json={
        "chitId": winner["chit_id"],
        "memberId": winner["member_id"],
        "monthNumber": 1,
        "winningAmount": winning,
        "discountAmount": discount,
        "installmentSettlement": installment_settlement,
        "crossChitSettlement": "0",
        "manualAdjustment": "0",
        "collectCurrentMonthInstallment": True,
        "notes": "cross-service reversal test",
        })


class TestPayoutCreation:
    def test_net_amount_is_winning_minus_discount(self, api, db, winner):
        r = _create_payout(api, winner)
        assert r.status_code in (200, 201), r.text[:300]

        payout_id = r.json()["data"]["id"]
        row = _payout_row(db, payout_id)
        # 50,000 - 1,000, computed by the service and checked against the rule
        # rather than against the service's own response field.
        assert Decimal(str(row["net_payout_amount"])) == Decimal("49000.00")

    def test_discount_equal_to_winning_is_refused(self, api, winner):
        # Guard against a zero or negative payout reaching the ledger.
        r = _create_payout(api, winner, winning="1000", discount="1000")
        assert r.status_code >= 400, (
            "a payout with discount == winning was accepted; net would be zero")

    def test_duplicate_payout_for_the_same_month_is_refused(self, api, winner):
        first = _create_payout(api, winner)
        assert first.status_code in (200, 201)
        second = _create_payout(api, winner)
        assert second.status_code >= 400, (
            "a second payout was created for the same chit month — the winner "
            "would be paid twice")

    def test_create_commits_business_and_audit_events_atomically(self, api, db, winner):
        created = _create_payout(api, winner)
        assert created.status_code in (200, 201), created.text[:300]
        payout_id = created.json()["data"]["id"]

        rows = db.query(
            "chitfund_payout",
            """SELECT delivery_id, event_id, event_type, destination, status
               FROM event_outbox WHERE aggregate_id=%s ORDER BY destination""",
            (payout_id,))
        assert len(rows) == 3
        assert len({row["delivery_id"] for row in rows}) == 3
        business_rows = [row for row in rows
                         if row["event_type"] == "PAYOUT_CREATED"]
        audit_rows = [row for row in rows if row["event_type"] == "AUDIT_LOG"]
        assert len(business_rows) == 2
        assert len({row["event_id"] for row in business_rows}) == 1
        assert len(audit_rows) == 1
        assert {row["destination"] for row in rows} == {
            "chitfund-audit-events", "chitfund-notification-events",
            "chitfund-reporting-events"}

        # The disposable stack intentionally has no SQS endpoint. Durable rows
        # must survive the outage and eventually become operator-visible FAILED
        # records instead of disappearing into a warning log.
        deadline = time.monotonic() + 20
        statuses = set()
        while time.monotonic() < deadline:
            statuses = {
                row["status"] for row in db.query(
                    "chitfund_payout",
                    "SELECT status FROM event_outbox WHERE aggregate_id=%s",
                    (payout_id,))}
            if statuses == {"FAILED"}:
                break
            time.sleep(0.5)
        assert statuses == {"FAILED"}, statuses


class TestVoidRevertsAcrossServices:
    """
    The R1 path: payout-service voids, then calls payment-service to undo the
    deduction. Both sides are asserted, because the failure mode is precisely
    that one succeeds and the other does not.
    """

    def test_deduction_is_reverted_when_the_payout_is_voided(self, api, db, winner):
        created = _create_payout(api, winner)
        assert created.status_code in (200, 201), created.text[:300]
        payout_id = created.json()["data"]["id"]

        created_commands = _wait_financial_sync(db, payout_id)
        assert [row["command_type"] for row in created_commands] == [
            "MARK_INSTALLMENT_DEDUCTION"]

        after_create = _record(db, winner["chit_id"], winner["member_id"])

        voided = api.as_role(
            "POST", f"{api.payout}/payouts/{payout_id}/void", winner["admin"],
            json={"reason": "created against the wrong member"})
        assert voided.status_code in (200, 201), voided.text[:300]

        # payout-service side
        assert _payout_row(db, payout_id)["status"] == "VOIDED"

        void_commands = _wait_financial_sync(db, payout_id)
        assert [row["command_type"] for row in void_commands] == [
            "MARK_INSTALLMENT_DEDUCTION", "REVERT_DEDUCTIONS"]

        # payment-service side — the durable command must eventually restore it.
        after_void = _record(db, winner["chit_id"], winner["member_id"])
        assert after_void["status"] != "PAYOUT_DEDUCTED", (
            f"installment is still PAYOUT_DEDUCTED after the payout was voided "
            f"(was {after_create['status']} before). The member is not being "
            "asked for money they now owe, and nothing surfaces the mismatch.")

    def test_no_record_still_points_at_a_voided_payout(self, api, db, winner):
        created = _create_payout(api, winner)
        payout_id = created.json()["data"]["id"]
        _wait_financial_sync(db, payout_id)
        api.as_role("POST", f"{api.payout}/payouts/{payout_id}/void", winner["admin"],
                    json={"reason": "reversal test"})
        _wait_financial_sync(db, payout_id)

        orphan = db.query(
            "chitfund_payment",
            "SELECT id, status FROM payment_records WHERE settled_by_payout_id=%s",
            (payout_id,))
        assert not list(orphan), (
            f"{len(list(orphan))} payment record(s) still reference voided payout "
            f"{payout_id}; a settlement would treat those months as already paid")

    def test_voiding_twice_is_refused(self, api, db, winner):
        created = _create_payout(api, winner)
        payout_id = created.json()["data"]["id"]

        first = api.as_role("POST", f"{api.payout}/payouts/{payout_id}/void",
                            winner["admin"], json={"reason": "first"})
        assert first.status_code in (200, 201)

        second = api.as_role("POST", f"{api.payout}/payouts/{payout_id}/void",
                             winner["admin"], json={"reason": "second"})
        # A second reversal would revert the deduction again, or return treasury
        # money twice.
        assert second.status_code >= 400, (
            "a payout was voided twice; the reversal is not idempotent")

    def test_void_is_append_only(self, api, db, winner):
        created = _create_payout(api, winner)
        payout_id = created.json()["data"]["id"]
        api.as_role("POST", f"{api.payout}/payouts/{payout_id}/void", winner["admin"],
                    json={"reason": "audit trail must survive"})

        # The row must still exist — financial history is not deleted.
        assert _payout_row(db, payout_id) is not None, (
            "the payout row was removed rather than marked VOIDED")


class TestDisbursementGuards:
    """Treasury protections that only hold if the service enforces them."""

    def test_cannot_disburse_more_than_the_net_payout(self, api, winner):
        created = _create_payout(api, winner)
        payout_id = created.json()["data"]["id"]

        r = api.as_role("POST", f"{api.payout}/payouts/{payout_id}/disburse",
                        winner["admin"],
                        json={"amount": "99999", "mode": "CASH", "reference": "x"})
        assert r.status_code >= 400, (
            "disbursed more than the approved net payout — treasury would be "
            "drained beyond what was authorised")

    def test_cannot_disburse_a_voided_payout(self, api, winner):
        created = _create_payout(api, winner)
        payout_id = created.json()["data"]["id"]
        api.as_role("POST", f"{api.payout}/payouts/{payout_id}/void", winner["admin"],
                    json={"reason": "voided before disbursement"})

        r = api.as_role("POST", f"{api.payout}/payouts/{payout_id}/disburse",
                        winner["admin"],
                        json={"amount": "100", "mode": "CASH", "reference": "x"})
        assert r.status_code >= 400, "money was disbursed against a voided payout"
