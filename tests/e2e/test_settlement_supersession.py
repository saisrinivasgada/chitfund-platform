"""MySQL 8 acceptance checks for audited settlement supersession (Phase B).

These tests intentionally cross the API/database boundary. Unit tests cannot
prove generated-column uniqueness, row-lock behaviour, or that compensating
ledger rows reconcile after a real MySQL commit.
"""

from __future__ import annotations

import uuid
from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal

import pytest

pytestmark = pytest.mark.concurrency


def _create_chit_and_partial_payment(api, token):
    """Create a real chit enrollment with one ₹1,000 due and ₹400 paid."""
    admin = token("ADMIN")
    member_id = str(uuid.uuid4())

    created = api.as_role("POST", f"{api.chit}/api/chits", admin, json={
        "chitType": "RESERVATION",
        "name": f"Phase B acceptance {uuid.uuid4()}",
        "chitValue": 2000,
        "installmentAmount": 1000,
        "numberOfMonths": 2,
        "numberOfMembers": 2,
        "monthlyDueDate": 1,
    })
    assert created.status_code == 201, created.text[:500]
    chit_id = created.json()["data"]["id"]

    enrolled = api.as_role(
        "POST", f"{api.chit}/api/chits/{chit_id}/enrollments", admin,
        json={"memberId": member_id})
    assert enrolled.status_code == 201, enrolled.text[:500]

    opened = api.as_role("POST", f"{api.payment}/admin/draws/open", admin, json={
        "chitId": chit_id,
        "monthNumber": 1,
        "dueDate": "2026-03-01",
        "installmentAmount": 1000,
        "maxCycles": 2,
        "members": [{"memberId": member_id, "amountDue": 1000}],
    })
    assert opened.status_code == 201, opened.text[:500]

    paid = api.as_role(
        "POST", f"{api.payment}/payments", admin,
        headers={"X-Idempotency-Key": str(uuid.uuid4())},
        json={
            "chitId": chit_id,
            "memberId": member_id,
            "amount": 400,
            "paymentMode": "UPI",
            "notes": "Phase B acceptance partial payment",
        })
    assert paid.status_code == 201, paid.text[:500]
    return {"admin": admin, "member_id": member_id, "chit_id": chit_id}


def _confirm(api, fixture, *, supersedes=None, key=None, reason=None):
    body = {
        "memberId": fixture["member_id"],
        "chitItems": [{"chitId": fixture["chit_id"], "mode": "FAIR"}],
    }
    if supersedes is not None:
        body["supersedesSettlementId"] = supersedes
        body["supersessionReason"] = reason or "MySQL 8 acceptance correction"
    return api.as_role(
        "POST", f"{api.payment}/settlement/confirm", fixture["admin"],
        headers={"X-Idempotency-Key": key or str(uuid.uuid4())}, json=body)


def _record_disbursement(api, fixture, settlement_id, amount="250"):
    response = api.as_role(
        "POST", f"{api.payment}/settlement/{settlement_id}/transactions",
        fixture["admin"],
        json={
            "settlementId": settlement_id,
            "amount": amount,
            "mode": "CASH",
            "idempotencyKey": str(uuid.uuid4()),
            "notes": "Partial refund before audited correction",
        })
    assert response.status_code == 201, response.text[:500]
    return response.json()["data"]["id"]


def test_partial_money_supersession_reverses_and_replaces_exactly(api, token, db):
    fixture = _create_chit_and_partial_payment(api, token)
    first = _confirm(api, fixture)
    assert first.status_code == 201, first.text[:500]
    first_data = first.json()["data"]
    first_id = first_data["id"]
    assert Decimal(str(first_data["netAmount"])) == Decimal("-400.00")

    original_transaction_id = _record_disbursement(api, fixture, first_id)
    replacement = _confirm(api, fixture, supersedes=first_id)
    assert replacement.status_code == 201, replacement.text[:500]
    replacement_data = replacement.json()["data"]
    replacement_id = replacement_data["id"]
    assert Decimal(str(replacement_data["netAmount"])) == Decimal("-400.00")
    assert replacement_data["settlementVersion"] == 2

    rows = list(db.query(
        "chitfund_payment",
        """SELECT id, net_amount, payment_status, collected_amount,
                  disbursed_amount, active_slot, supersedes_id, superseded_by_id,
                  reversal_completed_at
           FROM settlements WHERE member_id=%s ORDER BY settlement_version""",
        (fixture["member_id"],)))
    assert len(rows) == 2
    old, new = rows
    assert old["id"] == first_id
    assert Decimal(str(old["net_amount"])) == Decimal("-400.00")
    assert Decimal(str(old["disbursed_amount"])) == Decimal("250.00")
    assert old["payment_status"] == "PARTIALLY_DISBURSED"
    assert old["active_slot"] is None
    assert old["superseded_by_id"] == replacement_id
    assert old["reversal_completed_at"] is not None
    assert new["id"] == replacement_id
    assert Decimal(str(new["net_amount"])) == Decimal("-400.00")
    assert new["active_slot"] == 1
    assert new["supersedes_id"] == first_id

    record = db.one(
        "chitfund_payment",
        """SELECT id, status, amount_paid, amount_due FROM payment_records
           WHERE member_id=%s AND chit_id=%s""",
        (fixture["member_id"], fixture["chit_id"]))
    assert record["status"] == "SETTLEMENT_CLEARED"
    assert Decimal(str(record["amount_paid"])) == Decimal("400.00")
    assert Decimal(str(record["amount_due"])) == Decimal("1000.00")

    effects = list(db.query(
        "chitfund_payment",
        """SELECT settlement_id, payment_record_id, before_status, after_status,
                  before_amount_paid, before_amount_due, reversed_at
           FROM settlement_payment_record_effects
           WHERE settlement_id IN (%s, %s) ORDER BY settlement_id""",
        (first_id, replacement_id)))
    assert len(effects) == 2
    by_settlement = {row["settlement_id"]: row for row in effects}
    assert by_settlement[first_id]["before_status"] == "PARTIALLY_PAID"
    assert by_settlement[first_id]["reversed_at"] is not None
    assert by_settlement[replacement_id]["before_status"] == "PARTIALLY_PAID"
    assert by_settlement[replacement_id]["reversed_at"] is None
    assert {row["payment_record_id"] for row in effects} == {record["id"]}

    transactions = list(db.query(
        "chitfund_payment",
        """SELECT id, amount, direction, reversal_of_id
           FROM settlement_payment_transactions
           WHERE settlement_id=%s ORDER BY created_at""",
        (first_id,)))
    assert len(transactions) == 2
    original = next(row for row in transactions if row["id"] == original_transaction_id)
    reversal = next(row for row in transactions if row["reversal_of_id"] is not None)
    assert reversal["reversal_of_id"] == original["id"]
    assert Decimal(str(reversal["amount"])) == Decimal(str(original["amount"]))
    assert {original["direction"], reversal["direction"]} == {
        "DISBURSEMENT", "COLLECTION"
    }

    wallet = list(db.query(
        "chitfund_payment",
        """SELECT id, entry_type, amount, reference_id, reversal_of_entry_id
           FROM admin_wallet WHERE reference_id IN (%s, %s)""",
        (original["id"], reversal["id"])))
    assert len(wallet) == 2
    original_wallet = next(row for row in wallet if row["reference_id"] == original["id"])
    reversal_wallet = next(row for row in wallet if row["reference_id"] == reversal["id"])
    assert original_wallet["entry_type"] == "OUT"
    assert reversal_wallet["entry_type"] == "IN"
    assert reversal_wallet["reversal_of_entry_id"] == original_wallet["id"]
    signed_total = sum(
        Decimal(str(row["amount"])) * (1 if row["entry_type"] == "IN" else -1)
        for row in wallet)
    assert signed_total == Decimal("0.00")

    audit_types = {
        row["event_type"] for row in db.query(
            "chitfund_payment",
            """SELECT event_type FROM settlement_audit_events
               WHERE settlement_id IN (%s, %s)""",
            (first_id, replacement_id))
    }
    assert {
        "SETTLEMENT_CONFIRMED",
        "SETTLEMENT_SUPERSEDED",
        "SETTLEMENT_REPLACEMENT_CREATED",
    } <= audit_types


def test_v38_allows_voided_history_and_exactly_one_live_replacement(api, token, db):
    fixture = _create_chit_and_partial_payment(api, token)
    first = _confirm(api, fixture)
    assert first.status_code == 201, first.text[:500]
    first_id = first.json()["data"]["id"]

    voided = api.as_role(
        "POST", f"{api.payment}/settlement/{first_id}/void", fixture["admin"])
    assert voided.status_code == 200, voided.text[:500]

    replacement = _confirm(api, fixture, supersedes=first_id)
    assert replacement.status_code == 201, replacement.text[:500]
    replacement_id = replacement.json()["data"]["id"]

    rows = list(db.query(
        "chitfund_payment",
        """SELECT id, payment_status, active_slot, supersedes_id, superseded_by_id,
                  reversal_completed_at
           FROM settlements WHERE member_id=%s ORDER BY settlement_version""",
        (fixture["member_id"],)))
    assert len(rows) == 2
    assert rows[0]["id"] == first_id
    assert rows[0]["payment_status"] == "VOIDED"
    assert rows[0]["active_slot"] is None
    assert rows[0]["superseded_by_id"] == replacement_id
    assert rows[0]["reversal_completed_at"] is not None
    assert rows[1]["id"] == replacement_id
    assert rows[1]["active_slot"] == 1
    assert rows[1]["supersedes_id"] == first_id


def test_concurrent_supersession_creates_exactly_one_replacement(api, token, db):
    fixture = _create_chit_and_partial_payment(api, token)
    first = _confirm(api, fixture)
    assert first.status_code == 201, first.text[:500]
    first_id = first.json()["data"]["id"]

    with ThreadPoolExecutor(max_workers=2) as executor:
        responses = [future.result() for future in (
            executor.submit(_confirm, api, fixture, supersedes=first_id),
            executor.submit(_confirm, api, fixture, supersedes=first_id),
        )]

    assert sorted(response.status_code for response in responses) == [201, 409]
    rows = list(db.query(
        "chitfund_payment",
        """SELECT id, supersedes_id, superseded_by_id, active_slot
           FROM settlements WHERE member_id=%s ORDER BY settlement_version""",
        (fixture["member_id"],)))
    assert len(rows) == 2
    assert rows[0]["superseded_by_id"] == rows[1]["id"]
    assert rows[1]["supersedes_id"] == rows[0]["id"]
    assert sum(row["active_slot"] == 1 for row in rows) == 1


def test_supersession_chains_and_reversals_reconcile(db):
    broken_links = db.scalar(
        "chitfund_payment",
        """SELECT COUNT(*) FROM settlements old
           LEFT JOIN settlements replacement ON replacement.id = old.superseded_by_id
           WHERE old.superseded_by_id IS NOT NULL
             AND (replacement.id IS NULL OR replacement.supersedes_id <> old.id
                  OR old.reversal_completed_at IS NULL)""",
    )
    duplicate_transaction_reversals = db.scalar(
        "chitfund_payment",
        """SELECT COUNT(*) FROM (
             SELECT reversal_of_id FROM settlement_payment_transactions
             WHERE reversal_of_id IS NOT NULL
             GROUP BY reversal_of_id HAVING COUNT(*) > 1
           ) duplicate_reversals""",
    )
    duplicate_wallet_reversals = db.scalar(
        "chitfund_payment",
        """SELECT COUNT(*) FROM (
             SELECT reversal_of_entry_id FROM admin_wallet
             WHERE reversal_of_entry_id IS NOT NULL
             GROUP BY reversal_of_entry_id HAVING COUNT(*) > 1
           ) duplicate_reversals""",
    )
    assert broken_links == 0
    assert duplicate_transaction_reversals == 0
    assert duplicate_wallet_reversals == 0
