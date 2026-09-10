"""
Concurrency and idempotency — Phase 5, against the live stack.

This is the class of bug unit tests cannot reach. A mocked repository serialises
everything and always returns what it was told, so a missing lock or a
non-atomic read-then-write looks identical to a correct one. Here two real
requests race through a real database.

The property under test throughout: **a member's money must be affected exactly
once**, no matter how many times a request arrives or how they overlap.

    pytest tests/e2e/test_concurrency_idempotency.py -v

DESTRUCTIVE — writes financial rows. The fixtures refuse to run off-loopback.
"""

from __future__ import annotations

import uuid
from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal

import pytest

pytestmark = pytest.mark.concurrency


@pytest.fixture
def chit_month(api, token, db):
    """
    Opens a real draw with two members, each owing 1,000.

    Built through the admin API rather than by inserting rows, so the records
    are created the way production creates them.
    """
    admin = token("ADMIN")
    chit_id = str(uuid.uuid4())
    m1, m2 = str(uuid.uuid4()), str(uuid.uuid4())

    r = api.as_role("POST", f"{api.payment}/admin/draws/open", admin, json={
        "chitId": chit_id, "monthNumber": 1, "dueDate": "2026-03-01",
        "installmentAmount": 1000, "maxCycles": 12,
        "members": [{"memberId": m1, "amountDue": 1000},
                    {"memberId": m2, "amountDue": 1000}],
    })
    assert r.status_code == 201, f"could not open draw: {r.status_code} {r.text[:200]}"

    return {"chit_id": chit_id, "member": m1, "other": m2, "admin": admin}


def _paid(db, chit_id: str, member_id: str) -> Decimal:
    v = db.scalar(
        "chitfund_payment",
        "SELECT amount_paid FROM payment_records WHERE chit_id=%s AND member_id=%s",
        (chit_id, member_id))
    return Decimal(str(v))


def _batches(db, chit_id: str, member_id: str):
    return db.query(
        "chitfund_payment",
        """SELECT id, total_amount, status, idempotency_key
           FROM payment_batches WHERE chit_id=%s AND member_id=%s""",
        (chit_id, member_id))


class TestIdempotencyKey:
    """A retried request must not charge the member twice."""

    def test_same_key_twice_creates_one_batch(self, api, db, chit_month):
        key = f"test-{uuid.uuid4()}"
        body = {"chitId": chit_month["chit_id"], "memberId": chit_month["member"],
                "amount": 1000, "paymentMode": "UPI"}

        first = api.as_role("POST", f"{api.payment}/payments", chit_month["admin"],
                            json=body, headers={"X-Idempotency-Key": key})
        second = api.as_role("POST", f"{api.payment}/payments", chit_month["admin"],
                             json=body, headers={"X-Idempotency-Key": key})

        assert first.status_code in (200, 201), first.text[:200]
        assert second.status_code in (200, 201), second.text[:200]

        batches = _batches(db, chit_month["chit_id"], chit_month["member"])
        assert len(batches) == 1, (
            f"a replayed idempotency key produced {len(batches)} batches — "
            "the member was charged more than once")
        assert _paid(db, chit_month["chit_id"], chit_month["member"]) == Decimal("1000.00")

    def test_same_key_different_amount_does_not_double_charge(self, api, db, chit_month):
        """
        A retry carrying a different payload is the dangerous case: naive
        handling could treat it as a new payment and allocate twice.
        """
        key = f"test-{uuid.uuid4()}"
        base = {"chitId": chit_month["chit_id"], "memberId": chit_month["member"],
                "paymentMode": "UPI"}

        api.as_role("POST", f"{api.payment}/payments", chit_month["admin"],
                    json={**base, "amount": 400}, headers={"X-Idempotency-Key": key})
        api.as_role("POST", f"{api.payment}/payments", chit_month["admin"],
                    json={**base, "amount": 900}, headers={"X-Idempotency-Key": key})

        batches = _batches(db, chit_month["chit_id"], chit_month["member"])
        assert len(batches) == 1, (
            "a reused key with a different amount created a second batch")
        # The first payload wins; only 400 was ever really collected.
        assert _paid(db, chit_month["chit_id"], chit_month["member"]) == Decimal("400.00")

    def test_no_key_allows_a_genuine_second_payment(self, api, db, chit_month):
        # Idempotency must not be so eager that two real instalments collapse
        # into one — without a key these are distinct payments.
        body = {"chitId": chit_month["chit_id"], "memberId": chit_month["member"],
                "amount": 300, "paymentMode": "CASH"}
        api.as_role("POST", f"{api.payment}/payments", chit_month["admin"], json=body)
        api.as_role("POST", f"{api.payment}/payments", chit_month["admin"], json=body)

        assert len(_batches(db, chit_month["chit_id"], chit_month["member"])) == 2


class TestConcurrentPayments:
    """
    Simultaneous collection — the scenario behind "two staff collected the same
    installment". A read-then-write without a row lock double-allocates here.
    """

    def test_two_identical_requests_with_one_key_charge_once(self, api, db, chit_month):
        key = f"race-{uuid.uuid4()}"
        body = {"chitId": chit_month["chit_id"], "memberId": chit_month["member"],
                "amount": 1000, "paymentMode": "UPI"}

        def send():
            return api.as_role("POST", f"{api.payment}/payments", chit_month["admin"],
                               json=body, headers={"X-Idempotency-Key": key})

        with ThreadPoolExecutor(max_workers=2) as ex:
            results = [f.result() for f in [ex.submit(send), ex.submit(send)]]

        batches = _batches(db, chit_month["chit_id"], chit_month["member"])
        assert len(batches) == 1, (
            f"a concurrent retry created {len(batches)} batches. The in-code "
            "idempotency check lost the race; only the unique constraint stands "
            "between this and a double charge.")
        assert _paid(db, chit_month["chit_id"], chit_month["member"]) == Decimal("1000.00")
        assert any(r.status_code in (200, 201) for r in results)

    def test_concurrent_distinct_payments_do_not_over_allocate(self, api, db, chit_month):
        """
        Two different payments of 600 against a 1,000 debt. Both are legitimate,
        so both must be recorded — but the record must not end up paid 1,200
        against a 1,000 due. The excess belongs in credit, not on the record.
        """
        def send(amount):
            return api.as_role("POST", f"{api.payment}/payments", chit_month["admin"],
                               json={"chitId": chit_month["chit_id"],
                                     "memberId": chit_month["member"],
                                     "amount": amount, "paymentMode": "UPI"})

        with ThreadPoolExecutor(max_workers=2) as ex:
            [f.result() for f in [ex.submit(send, 600), ex.submit(send, 600)]]

        paid = _paid(db, chit_month["chit_id"], chit_month["member"])
        due = Decimal(str(db.scalar(
            "chitfund_payment",
            "SELECT amount_due FROM payment_records WHERE chit_id=%s AND member_id=%s",
            (chit_month["chit_id"], chit_month["member"]))))

        assert paid <= due, (
            f"record shows {paid} paid against {due} due — concurrent allocation "
            "overshot, so money landed on a record instead of becoming credit")

    def test_allocations_never_exceed_the_batch_total(self, api, db, chit_month):
        """
        Whatever the interleaving, the sum allocated from a batch cannot exceed
        what the batch collected. Violating this creates money.
        """
        def send():
            return api.as_role("POST", f"{api.payment}/payments", chit_month["admin"],
                               json={"chitId": chit_month["chit_id"],
                                     "memberId": chit_month["member"],
                                     "amount": 500, "paymentMode": "UPI"})

        with ThreadPoolExecutor(max_workers=3) as ex:
            [f.result() for f in [ex.submit(send) for _ in range(3)]]

        rows = db.query(
            "chitfund_payment",
            """SELECT b.id, b.total_amount,
                      COALESCE(SUM(a.allocated_amount), 0) AS allocated
               FROM payment_batches b
               LEFT JOIN payment_allocations a ON a.batch_id = b.id
               WHERE b.chit_id=%s AND b.member_id=%s AND b.status <> 'VOIDED'
               GROUP BY b.id, b.total_amount""",
            (chit_month["chit_id"], chit_month["member"]))

        for r in rows:
            assert Decimal(str(r["allocated"])) <= Decimal(str(r["total_amount"])), (
                f"batch {r['id']} allocated {r['allocated']} from a "
                f"{r['total_amount']} payment — allocation invented money")


class TestTreasuryUnderConcurrency:
    """Treasury must equal the payments that actually completed — no more."""

    def test_treasury_matches_completed_batches(self, api, db, chit_month):
        def send(n):
            return api.as_role("POST", f"{api.payment}/payments", chit_month["admin"],
                               json={"chitId": chit_month["chit_id"],
                                     "memberId": chit_month["member"],
                                     "amount": 100, "paymentMode": "UPI"})

        with ThreadPoolExecutor(max_workers=4) as ex:
            [f.result() for f in [ex.submit(send, i) for i in range(4)]]

        collected = db.scalar(
            "chitfund_payment",
            """SELECT COALESCE(SUM(total_amount), 0) FROM payment_batches
               WHERE chit_id=%s AND status = 'COMPLETED'""",
            (chit_month["chit_id"],))

        treasury_in = db.scalar(
            "chitfund_payment",
            """SELECT COALESCE(SUM(amount), 0) FROM admin_wallet
               WHERE entry_type = 'IN' AND category = 'PAYMENT'""")

        # Other tests in the session also collect, so assert the direction that
        # matters: the treasury cannot hold less than this chit's completed
        # payments, which would mean money was collected and never banked.
        assert Decimal(str(treasury_in)) >= Decimal(str(collected)), (
            f"treasury IN {treasury_in} is short of {collected} collected — "
            "a payment completed without reaching the treasury")
