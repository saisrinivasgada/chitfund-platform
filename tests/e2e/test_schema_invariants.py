"""
Schema-level invariants — Phase 2, run against the live stack.

These check properties of the database that unit tests cannot see because they
mock the repository away: that the constraints protecting money actually exist,
that every money column has the precision the calculations assume, and that a
service can build its schema from empty.

That last one is not hypothetical. payment-service could not migrate a fresh
database until 2026-09-10 — two migrations added the same column and a third
read a column that did not exist yet. Production only survived because its
schema grew incrementally and the deploy deletes failed migration rows. These
tests exist so that cannot regress silently.

    pytest tests/e2e/test_schema_invariants.py -v
"""

from decimal import Decimal

import pytest

pytestmark = pytest.mark.recon

SCHEMAS = [
    "chitfund_user",
    "chitfund_member",
    "chitfund_chit",
    "chitfund_payment",
    "chitfund_payout",
]

# Every column that holds money. The oracle assumes 2dp throughout; a column with
# a different scale would silently round differently from every expected value.
MONEY_COLUMNS = [
    ("chitfund_payment", "payment_records", "amount_due"),
    ("chitfund_payment", "payment_records", "amount_paid"),
    ("chitfund_payment", "payment_batches", "total_amount"),
    ("chitfund_payment", "payment_allocations", "allocated_amount"),
    ("chitfund_payout", "payouts", "net_payout_amount"),
    ("chitfund_payout", "payouts", "disbursed_amount"),
]


class TestMigrationsApplyCleanly:
    """A service that cannot rebuild its schema cannot be recovered."""

    @pytest.mark.parametrize("schema", SCHEMAS)
    def test_no_failed_migrations(self, db, schema):
        # pymysql returns a tuple of rows, so compare on emptiness rather than
        # against a list literal — `() == []` is False and would always fail.
        failed = list(db.query(
            schema,
            "SELECT version, description FROM flyway_schema_history WHERE success = 0"))
        assert not failed, (
            f"{schema} has failed migrations: {failed}. "
            "The deploy deletes these rows, so a failure here would be invisible "
            "in production while making the schema unbuildable from scratch.")

    @pytest.mark.parametrize("schema", SCHEMAS)
    def test_migrations_actually_ran(self, db, schema):
        count = db.scalar(schema, "SELECT COUNT(*) FROM flyway_schema_history")
        assert count and count > 0, f"{schema} has no migration history at all"

    def test_payment_schema_built_from_empty(self, db):
        # The stack this runs against was created by test-reset.sh dropping every
        # schema, so reaching this point at all proves a fresh build works.
        applied = db.scalar(
            "chitfund_payment", "SELECT COUNT(*) FROM flyway_schema_history WHERE success = 1")
        assert applied >= 35, (
            f"expected the full payment-service migration chain, got {applied}")


class TestMoneyColumnPrecision:
    """
    Every money column must be DECIMAL with scale 2.

    A float column would make exact comparison meaningless, and a different scale
    would round differently from the oracle — producing failures that look like
    calculation bugs but are really schema bugs.
    """

    @pytest.mark.parametrize("schema,table,column", MONEY_COLUMNS)
    def test_is_decimal_scale_two(self, db, schema, table, column):
        row = db.one(
            schema,
            """SELECT DATA_TYPE, NUMERIC_SCALE, NUMERIC_PRECISION
               FROM information_schema.COLUMNS
               WHERE TABLE_SCHEMA = %s AND TABLE_NAME = %s AND COLUMN_NAME = %s""",
            (schema, table, column))
        assert row is not None, f"{schema}.{table}.{column} does not exist"
        assert row["DATA_TYPE"] == "decimal", (
            f"{table}.{column} is {row['DATA_TYPE']}, not decimal — "
            "money must never be a binary float type")
        assert row["NUMERIC_SCALE"] == 2, (
            f"{table}.{column} has scale {row['NUMERIC_SCALE']}, expected 2")


class TestConstraintsThatProtectMoney:
    """Constraints the application relies on but does not itself enforce."""

    def test_one_payment_record_per_member_chit_month(self, db):
        # Without this a second record for the same month could be created and
        # the member would owe the installment twice.
        rows = db.query(
            "chitfund_payment",
            """SELECT INDEX_NAME, NON_UNIQUE, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) cols
               FROM information_schema.STATISTICS
               WHERE TABLE_SCHEMA = 'chitfund_payment' AND TABLE_NAME = 'payment_records'
               GROUP BY INDEX_NAME, NON_UNIQUE""")
        unique = [r for r in rows if r["NON_UNIQUE"] == 0]
        assert any(
            {"chit_id", "member_id", "month_number"} <= set(r["cols"].split(","))
            for r in unique), (
            "payment_records has no unique constraint over (chit_id, member_id, "
            f"month_number). Unique indexes present: {[r['cols'] for r in unique]}")

    def test_idempotency_key_is_unique(self, db):
        # The retry guard is only real if the database enforces it; checking in
        # application code alone loses the race.
        rows = db.query(
            "chitfund_payment",
            """SELECT INDEX_NAME, NON_UNIQUE, COLUMN_NAME
               FROM information_schema.STATISTICS
               WHERE TABLE_SCHEMA = 'chitfund_payment'
                 AND TABLE_NAME = 'payment_batches'
                 AND COLUMN_NAME = 'idempotency_key'""")
        assert rows, "payment_batches.idempotency_key has no index at all"
        assert any(r["NON_UNIQUE"] == 0 for r in rows), (
            "idempotency_key is indexed but not UNIQUE — a concurrent retry could "
            "create two batches and charge the member twice")

    def test_tenant_id_present_on_money_tables(self, db):
        # Tenant isolation is enforced in queries; if the column is missing the
        # scoping silently degrades to no scoping.
        for table in ("payment_records", "payment_batches", "admin_wallet",
                      "cash_payment_requests", "chit_month_draws"):
            col = db.one(
                "chitfund_payment",
                """SELECT COLUMN_NAME FROM information_schema.COLUMNS
                   WHERE TABLE_SCHEMA = 'chitfund_payment'
                     AND TABLE_NAME = %s AND COLUMN_NAME = 'tenant_id'""",
                (table,))
            assert col is not None, f"{table} has no tenant_id column"

    def test_tenant_id_added_exactly_once(self, db):
        # V10 and V26 both added tenant_id to chit_month_draws, which made the
        # schema unbuildable. Guard against a duplicate definition returning.
        count = db.scalar(
            "chitfund_payment",
            """SELECT COUNT(*) FROM information_schema.COLUMNS
               WHERE TABLE_SCHEMA = 'chitfund_payment'
                 AND TABLE_NAME = 'chit_month_draws' AND COLUMN_NAME = 'tenant_id'""")
        assert count == 1


class TestEmptyStackHasNoMoney:
    """
    A freshly reset stack must hold no financial rows.

    If it does, a later test asserting a balance would be measuring leftovers
    from a previous run rather than what it just did.
    """

    @pytest.mark.parametrize("schema,table", [
        ("chitfund_payment", "payment_records"),
        ("chitfund_payment", "payment_batches"),
        ("chitfund_payment", "payment_allocations"),
        ("chitfund_payment", "admin_wallet"),
        ("chitfund_payout", "payouts"),
    ])
    def test_table_is_empty_after_reset(self, db, schema, table):
        count = db.scalar(schema, f"SELECT COUNT(*) FROM `{table}`")
        assert count == 0, (
            f"{schema}.{table} holds {count} rows on a supposedly clean stack — "
            "run scripts/test-reset.sh before the suite")

    def test_treasury_starts_at_zero(self, db):
        # The reconciliation tests all measure movement from this baseline.
        total = db.scalar(
            "chitfund_payment",
            """SELECT COALESCE(SUM(CASE WHEN entry_type = 'IN' THEN amount ELSE -amount END), 0)
               FROM admin_wallet""")
        assert Decimal(str(total)) == Decimal("0.00")
