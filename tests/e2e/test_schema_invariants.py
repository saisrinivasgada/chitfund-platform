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

    def test_v37_and_v38_are_applied(self, db):
        rows = db.query(
            "chitfund_payment",
            """SELECT version, success FROM flyway_schema_history
               WHERE version IN ('37', '38') ORDER BY installed_rank""")
        assert [(str(row["version"]), row["success"]) for row in rows] == [
            ("37", 1), ("38", 1)
        ]

    def test_payment_outbox_migration_is_applied(self, db):
        row = db.one(
            "chitfund_payment",
            """SELECT version, success FROM flyway_schema_history
               WHERE version = '39'""")
        assert row is not None
        assert str(row["version"]) == "39"
        assert row["success"] == 1

    def test_admin_wallet_paise_expand_migration_is_applied(self, db):
        row = db.one(
            "chitfund_payment",
            """SELECT version, success FROM flyway_schema_history
               WHERE version = '40'""")
        assert row is not None
        assert str(row["version"]) == "40"
        assert row["success"] == 1

        column = db.one(
            "chitfund_payment",
            """SELECT DATA_TYPE, IS_NULLABLE FROM information_schema.COLUMNS
               WHERE TABLE_SCHEMA='chitfund_payment'
                 AND TABLE_NAME='admin_wallet' AND COLUMN_NAME='amount_paise'""")
        assert column == {"DATA_TYPE": "bigint", "IS_NULLABLE": "YES"}

        constraint = db.one(
            "chitfund_payment",
            """SELECT ENFORCED FROM information_schema.TABLE_CONSTRAINTS
               WHERE CONSTRAINT_SCHEMA='chitfund_payment'
                 AND TABLE_NAME='admin_wallet'
                 AND CONSTRAINT_NAME='chk_admin_wallet_amount_paise_nonnegative'
                 AND CONSTRAINT_TYPE='CHECK'""")
        assert constraint == {"ENFORCED": "YES"}

    def test_payout_outbox_migration_is_applied(self, db):
        row = db.one(
            "chitfund_payout",
            """SELECT version, success FROM flyway_schema_history
               WHERE version = '10'""")
        assert row is not None
        assert str(row["version"]) == "10"
        assert row["success"] == 1

    def test_v38_active_slot_is_a_mysql_generated_column(self, db):
        column = db.one(
            "chitfund_payment",
            """SELECT DATA_TYPE, EXTRA, GENERATION_EXPRESSION
               FROM information_schema.COLUMNS
               WHERE TABLE_SCHEMA = 'chitfund_payment'
                 AND TABLE_NAME = 'settlements'
                 AND COLUMN_NAME = 'active_slot'""")
        assert column is not None
        assert column["DATA_TYPE"] == "tinyint"
        assert "STORED GENERATED" in column["EXTRA"].upper()
        expression = column["GENERATION_EXPRESSION"].lower()
        assert "superseded_by_id" in expression
        assert "payment_status" in expression
        assert "voided" in expression

    def test_v38_unique_index_allows_only_one_live_settlement(self, db):
        rows = db.query(
            "chitfund_payment",
            """SELECT NON_UNIQUE, COLUMN_NAME, SEQ_IN_INDEX
               FROM information_schema.STATISTICS
               WHERE TABLE_SCHEMA = 'chitfund_payment'
                 AND TABLE_NAME = 'settlements'
                 AND INDEX_NAME = 'uk_settlement_one_live_per_member'
               ORDER BY SEQ_IN_INDEX""")
        assert rows
        assert all(row["NON_UNIQUE"] == 0 for row in rows)
        assert [row["COLUMN_NAME"] for row in rows] == [
            "tenant_id", "member_id", "active_slot"
        ]

    def test_outbox_has_stable_event_destination_uniqueness(self, db):
        rows = db.query(
            "chitfund_payment",
            """SELECT NON_UNIQUE, COLUMN_NAME, SEQ_IN_INDEX
               FROM information_schema.STATISTICS
               WHERE TABLE_SCHEMA = 'chitfund_payment'
                 AND TABLE_NAME = 'event_outbox'
                 AND INDEX_NAME = 'uq_outbox_event_destination'
               ORDER BY SEQ_IN_INDEX""")
        assert rows
        assert all(row["NON_UNIQUE"] == 0 for row in rows)
        assert [row["COLUMN_NAME"] for row in rows] == ["event_id", "destination"]

    def test_payout_outbox_has_stable_event_destination_uniqueness(self, db):
        rows = db.query(
            "chitfund_payout",
            """SELECT NON_UNIQUE, COLUMN_NAME, SEQ_IN_INDEX
               FROM information_schema.STATISTICS
               WHERE TABLE_SCHEMA = 'chitfund_payout'
                 AND TABLE_NAME = 'event_outbox'
                 AND INDEX_NAME = 'uq_outbox_event_destination'
               ORDER BY SEQ_IN_INDEX""")
        assert rows
        assert all(row["NON_UNIQUE"] == 0 for row in rows)
        assert [row["COLUMN_NAME"] for row in rows] == ["event_id", "destination"]


class TestLedgerInvariants:
    """
    Properties that must hold whatever the stack contains.

    An earlier version of this class asserted the tables were empty, which only
    held in the instant after a reset — the concurrency and payout tests
    legitimately write rows, so it failed as soon as the suite grew. "Empty" was
    also a much weaker claim than what actually matters: that the ledger is
    self-consistent no matter how much has happened to it.
    """

    def test_no_allocation_exceeds_its_batch(self, db):
        # Allocating more than was collected creates money out of nothing.
        bad = db.query(
            "chitfund_payment",
            """SELECT b.id, b.total_amount, SUM(a.allocated_amount) AS allocated
               FROM payment_batches b
               JOIN payment_allocations a ON a.batch_id = b.id
               GROUP BY b.id, b.total_amount
               HAVING SUM(a.allocated_amount) > b.total_amount""")
        assert not list(bad), f"batches allocated beyond their own total: {list(bad)}"

    def test_no_record_is_paid_more_than_it_is_due(self, db):
        # Overpayment belongs in the credit balance, never on the record.
        bad = db.query(
            "chitfund_payment",
            """SELECT id, chit_id, member_id, amount_due, amount_paid
               FROM payment_records WHERE amount_paid > amount_due""")
        assert not list(bad), f"records paid beyond what is owed: {list(bad)}"

    def test_no_negative_money_anywhere(self, db):
        for table, col in (("payment_records", "amount_paid"),
                           ("payment_records", "amount_due"),
                           ("payment_batches", "total_amount"),
                           ("payment_allocations", "allocated_amount")):
            n = db.scalar("chitfund_payment",
                          f"SELECT COUNT(*) FROM `{table}` WHERE `{col}` < 0")
            assert n == 0, f"{table}.{col} holds {n} negative value(s)"

    def test_voided_batches_have_no_live_allocations(self, db):
        # A voided payment must not still be paying down an installment.
        bad = db.query(
            "chitfund_payment",
            """SELECT b.id
               FROM payment_batches b
               JOIN payment_allocations a ON a.batch_id = b.id
               JOIN payment_records r ON r.id = a.payment_record_id
               WHERE b.status = 'VOIDED' AND r.amount_paid > 0
                 AND r.status IN ('SETTLED', 'PARTIALLY_PAID')
                 AND NOT EXISTS (
                     SELECT 1 FROM payment_allocations a2
                     JOIN payment_batches b2 ON b2.id = a2.batch_id
                     WHERE a2.payment_record_id = r.id AND b2.status <> 'VOIDED')""")
        assert not list(bad), (
            f"records still show payment from voided batches only: {list(bad)}")

    def test_treasury_never_holds_less_than_completed_collections(self, db):
        collected = Decimal(str(db.scalar(
            "chitfund_payment",
            "SELECT COALESCE(SUM(total_amount), 0) FROM payment_batches WHERE status='COMPLETED'")))
        banked = Decimal(str(db.scalar(
            "chitfund_payment",
            "SELECT COALESCE(SUM(amount), 0) FROM admin_wallet WHERE entry_type='IN'")))
        assert banked >= collected, (
            f"treasury received {banked} against {collected} collected — money "
            "was taken from a member and never reached the books")

    def test_disbursed_never_exceeds_approved_payout(self, db):
        bad = db.query(
            "chitfund_payout",
            """SELECT id, net_payout_amount, disbursed_amount FROM payouts
               WHERE disbursed_amount > net_payout_amount""")
        assert not list(bad), f"payouts disbursed beyond approval: {list(bad)}"
