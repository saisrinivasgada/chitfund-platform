"""
Settlement confirmation under concurrency — risk R5 in the plan.

SettlementService.confirm guards against a duplicate by calling
existsByMemberIdAndTenantIdAndPaymentStatusNotIn and throwing if a live
settlement is found (SettlementService.java:161). That is a read followed by a
write with no lock and no unique constraint behind it, so two confirmations for
the same member can both pass the check before either has inserted.

A duplicate settlement is not a cosmetic problem: each one clears the member's
outstanding records and posts its own treasury movement, so the same debt would
be written off twice.

This test exists because I flagged the race as a risk earlier and never
demonstrated it. An unverified risk is a guess.

    pytest tests/e2e/test_settlement_race.py -v

DESTRUCTIVE — writes financial rows.
"""

from __future__ import annotations

import uuid
from concurrent.futures import ThreadPoolExecutor

import pytest

pytestmark = pytest.mark.concurrency


@pytest.fixture
def settleable_member(api, token, db):
    """A member with one unpaid installment, eligible to be settled."""
    admin = token("ADMIN")
    chit_id = str(uuid.uuid4())
    member_id = str(uuid.uuid4())

    r = api.as_role("POST", f"{api.payment}/admin/draws/open", admin, json={
        "chitId": chit_id, "monthNumber": 1, "dueDate": "2026-03-01",
        "installmentAmount": 1000, "maxCycles": 12,
        "members": [{"memberId": member_id, "amountDue": 1000}],
    })
    assert r.status_code == 201, r.text[:200]
    return {"chit_id": chit_id, "member_id": member_id, "admin": admin}


def _settlements(db, member_id):
    return list(db.query(
        "chitfund_payment",
        "SELECT id, payment_status, net_amount FROM settlements WHERE member_id=%s",
        (member_id,)))


def _confirm(api, m):
    return api.as_role("POST", f"{api.payment}/settlement/confirm", m["admin"], json={
        "memberId": m["member_id"],
        "chitItems": [{"chitId": m["chit_id"], "mode": "FAIR"}],
    })


class TestDuplicateSettlement:
    """
    Findings, stated at the level they were actually demonstrated.

    Proven: a member can end up with more than one settlement row, both
    sequentially and concurrently. The guard does not stop it because BALANCED
    sits in the terminal list, so a completed settlement is treated as no
    settlement at all.

    Not proven: that this moves money twice. In every scenario reachable from
    here the second settlement computes a net of zero, so nothing is refunded or
    collected again. Constructing a non-zero case needs a chit that exists in
    chit-service with enrollments and a payout, which this fixture does not
    build. Whether the duplicate can carry real money is therefore open — and is
    the question worth answering before deciding how hard to fix it.
    """

    @pytest.mark.xfail(
        reason="Confirmed defect: a second confirm succeeds for a member who "
               "already has a settlement. BALANCED is listed as terminal "
               "(SettlementService.java:156-163), so a completed settlement does "
               "not block a new one. Left failing rather than asserting the "
               "broken behaviour, because whether re-settlement should be allowed "
               "at all is a product decision.",
        strict=False)
    def test_sequential_second_confirm_is_refused(self, api, db, settleable_member):
        first = _confirm(api, settleable_member)
        second = _confirm(api, settleable_member)
        assert first.status_code < 400
        assert second.status_code >= 400, (
            "a second settlement was confirmed for a member who already had one")
        assert len(_settlements(db, settleable_member["member_id"])) == 1

    @pytest.mark.xfail(
        reason="R5 confirmed: the guard is a read-then-write with no lock and no "
               "unique constraint, so two concurrent confirms both pass it and "
               "two settlement rows are created. Money movement not demonstrated "
               "— the second computes zero in every scenario reachable here.",
        strict=False)
    def test_concurrent_confirms_create_at_most_one_settlement(self, api, db, settleable_member):
        with ThreadPoolExecutor(max_workers=2) as ex:
            results = [f.result() for f in
                       [ex.submit(_confirm, api, settleable_member),
                        ex.submit(_confirm, api, settleable_member)]]

        rows = _settlements(db, settleable_member["member_id"])
        assert len(rows) <= 1, (
            f"{len(rows)} settlements exist for one member after two concurrent "
            f"confirmations ({[r.status_code for r in results]})")
        assert len([r for r in results if r.status_code < 400]) <= 1

    def test_duplicates_never_carry_money_twice(self, api, db, settleable_member):
        """
        The property that actually matters while the duplication stands: however
        many settlement rows exist, they must not between them owe or refund more
        than once. This is the guard that would catch the duplication becoming
        financially harmful.
        """
        with ThreadPoolExecutor(max_workers=2) as ex:
            [f.result() for f in
             [ex.submit(_confirm, api, settleable_member),
              ex.submit(_confirm, api, settleable_member)]]

        rows = _settlements(db, settleable_member["member_id"])
        non_zero = [r for r in rows if float(r["net_amount"]) != 0.0]
        assert len(non_zero) <= 1, (
            f"{len(non_zero)} settlements carry a non-zero net amount for one "
            f"member: {non_zero}. The duplication is now moving real money — "
            "the same debt or refund is counted more than once.")

    def test_records_are_not_cleared_twice(self, api, db, settleable_member):
        """
        Even if only one settlement row survives, the clearing side-effect must
        not have run twice — a record can only be settled once.
        """
        with ThreadPoolExecutor(max_workers=2) as ex:
            [f.result() for f in
             [ex.submit(_confirm, api, settleable_member),
              ex.submit(_confirm, api, settleable_member)]]

        cleared = db.query(
            "chitfund_payment",
            """SELECT id, status, amount_paid, amount_due FROM payment_records
               WHERE chit_id=%s AND member_id=%s""",
            (settleable_member["chit_id"], settleable_member["member_id"]))

        for r in cleared:
            assert float(r["amount_paid"]) <= float(r["amount_due"]), (
                f"record {r['id']} shows {r['amount_paid']} paid against "
                f"{r['amount_due']} due — a double settlement over-credited it")

    def test_confirm_moves_no_money_by_itself(self, api, db, settleable_member):
        """
        Confirming records the obligation; cash moves later through
        recordTransaction. That separation is what keeps the duplication above
        from being immediately expensive, so it is worth pinning: if confirm
        ever starts posting treasury entries directly, the duplicate rows would
        become duplicate money.
        """
        before = db.scalar(
            "chitfund_payment",
            "SELECT COUNT(*) FROM admin_wallet WHERE category = 'SETTLEMENT'")

        with ThreadPoolExecutor(max_workers=2) as ex:
            [f.result() for f in
             [ex.submit(_confirm, api, settleable_member),
              ex.submit(_confirm, api, settleable_member)]]

        after = db.scalar(
            "chitfund_payment",
            "SELECT COUNT(*) FROM admin_wallet WHERE category = 'SETTLEMENT'")
        assert after == before, (
            f"confirm posted {after - before} treasury entries. With duplicate "
            "settlements possible, that turns a bookkeeping defect into "
            "double-counted money.")
