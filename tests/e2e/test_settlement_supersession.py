"""Disposable-stack acceptance checks for Phase B settlement supersession.

These stay xfail until the production-version MySQL stack is available. They are
not unit-test substitutes: generated columns, uniqueness and concurrent commits
must be proven by MySQL itself.
"""

from __future__ import annotations

import uuid

import pytest

pytestmark = pytest.mark.concurrency


@pytest.mark.xfail(
    reason="Phase B is implemented, but Docker/MySQL is unavailable for the required live migration check",
    strict=False,
)
def test_v38_allows_voided_history_and_exactly_one_live_replacement(api, token, db):
    admin = token("ADMIN")
    member_id = str(uuid.uuid4())
    chit_id = str(uuid.uuid4())
    opened = api.as_role("POST", f"{api.payment}/admin/draws/open", admin, json={
        "chitId": chit_id,
        "monthNumber": 1,
        "dueDate": "2026-03-01",
        "installmentAmount": 1000,
        "maxCycles": 12,
        "members": [{"memberId": member_id, "amountDue": 1000}],
    })
    assert opened.status_code == 201, opened.text[:300]

    first = api.as_role(
        "POST", f"{api.payment}/settlement/confirm", admin,
        headers={"X-Idempotency-Key": str(uuid.uuid4())},
        json={"memberId": member_id,
              "chitItems": [{"chitId": chit_id, "mode": "FAIR"}]})
    assert first.status_code == 201, first.text[:300]
    first_id = first.json()["data"]["id"]

    voided = api.as_role(
        "POST", f"{api.payment}/settlement/{first_id}/void", admin)
    assert voided.status_code == 200, voided.text[:300]

    replacement = api.as_role(
        "POST", f"{api.payment}/settlement/confirm", admin,
        headers={"X-Idempotency-Key": str(uuid.uuid4())},
        json={
            "memberId": member_id,
            "chitItems": [{"chitId": chit_id, "mode": "FAIR"}],
            "supersedesSettlementId": first_id,
            "supersessionReason": "Disposable MySQL generated-column acceptance test",
        })
    assert replacement.status_code == 201, replacement.text[:300]
    replacement_id = replacement.json()["data"]["id"]

    rows = db.query(
        "chitfund_payment",
        """SELECT id, payment_status, active_slot, supersedes_id, superseded_by_id,
                  reversal_completed_at
           FROM settlements WHERE member_id=%s ORDER BY settlement_version""",
        (member_id,),
    )
    assert len(rows) == 2
    assert rows[0]["id"] == first_id
    assert rows[0]["active_slot"] is None
    assert rows[0]["superseded_by_id"] == replacement_id
    assert rows[0]["reversal_completed_at"] is not None
    assert rows[1]["id"] == replacement_id
    assert rows[1]["active_slot"] == 1
    assert rows[1]["supersedes_id"] == first_id


@pytest.mark.xfail(
    reason="Requires a disposable live stack with Phase B settlement fixtures",
    strict=False,
)
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
