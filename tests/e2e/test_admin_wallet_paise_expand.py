"""Release-one paise expansion: dual-write without changing decimal reads."""

from __future__ import annotations

import uuid
from decimal import Decimal

import pytest

pytestmark = pytest.mark.recon


def test_new_wallet_entry_dual_writes_exact_paise_and_keeps_decimal_api(api, db, token):
    response = api.as_role(
        "POST", f"{api.payment}/admin/wallet", token("ADMIN"), json={
            "accountType": "CASH",
            "entryType": "IN",
            "amount": "1234.56",
            "category": "PAISE_EXPAND_TEST",
            "description": "disposable dual-write verification",
        })
    assert response.status_code == 201, response.text[:300]
    body = response.json()["data"]

    row = db.one(
        "chitfund_payment",
        "SELECT amount, amount_paise FROM admin_wallet WHERE id=%s",
        (body["id"],))
    assert Decimal(str(row["amount"])) == Decimal("1234.56")
    assert row["amount_paise"] == 123456
    assert Decimal(str(body["amount"])) == Decimal("1234.56")
    assert "amountPaise" not in body


def test_nullable_shadow_column_accepts_an_old_application_write(db):
    entry_id = str(uuid.uuid4())
    try:
        db.query("chitfund_payment", """
            INSERT INTO admin_wallet (
                id, tenant_id, account_type, entry_type, amount,
                category, description, created_at, created_by)
            VALUES (%s, 'paise-compat-test', 'CASH', 'IN', 10.00,
                    'PAISE_COMPAT_TEST', 'simulated old application write',
                    UTC_TIMESTAMP(6), '00000000-0000-0000-0000-0000000000aa')
            """, (entry_id,))
        assert db.scalar(
            "chitfund_payment",
            "SELECT amount_paise FROM admin_wallet WHERE id=%s", (entry_id,)) is None
    finally:
        db.query("chitfund_payment", "DELETE FROM admin_wallet WHERE id=%s", (entry_id,))


def test_fractional_paise_is_rejected_instead_of_rounded(api, token):
    response = api.as_role(
        "POST", f"{api.payment}/admin/wallet", token("ADMIN"), json={
            "accountType": "CASH",
            "entryType": "IN",
            "amount": "1.001",
            "category": "PAISE_NEGATIVE_TEST",
        })
    assert response.status_code == 400


def test_reconciliation_metrics_are_authenticated_and_exported(api, token):
    anonymous = api.get(f"{api.payment}/actuator/prometheus")
    assert anonymous.status_code == 401

    authenticated = api.as_role(
        "GET", f"{api.payment}/actuator/prometheus", token("ADMIN"))
    assert authenticated.status_code == 200
    assert "chitwise_money_shadow_missing" in authenticated.text
    assert "chitwise_money_shadow_mismatch" in authenticated.text
    assert 'table="admin_wallet"' in authenticated.text
