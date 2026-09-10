"""
Self-check for the oracle.

The oracle is only trustworthy if it is itself verified, so every expected value
below was worked out by hand from the rules in the plan and hard-coded as a
literal. Nothing here calls the application, and nothing derives an expectation
from `chitmath` — that would make the check circular.

If a case here fails, either the hand arithmetic or the oracle is wrong. Resolve
it before trusting any downstream test result.

Run:  python3 tests/oracle/test_oracle_selfcheck.py
"""

from decimal import Decimal
import sys, os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import chitmath as m
from chitmath import CommissionType as CT, RecordStatus as RS, Record

FAILURES = []


def check(case_id, description, expected, actual):
    ok = expected == actual
    if not ok:
        FAILURES.append((case_id, description, expected, actual))
    mark = "ok  " if ok else "FAIL"
    print(f"  {mark} {case_id:<12} {description}")
    if not ok:
        print(f"       expected {expected!r}")
        print(f"       actual   {actual!r}")
        print(f"       diff     {actual - expected!r}"
              if isinstance(expected, Decimal) and isinstance(actual, Decimal) else "")


def expect_raises(case_id, description, exc_type, fn, *a, **kw):
    try:
        fn(*a, **kw)
    except exc_type:
        print(f"  ok   {case_id:<12} {description}")
        return
    except Exception as e:
        FAILURES.append((case_id, description, exc_type.__name__, type(e).__name__))
        print(f"  FAIL {case_id:<12} {description} — raised {type(e).__name__}")
        return
    FAILURES.append((case_id, description, exc_type.__name__, "no exception"))
    print(f"  FAIL {case_id:<12} {description} — did not raise")


print("\n── CALC-A: auction commission, dividend ────────────────────────────")

# Pot ₹120,000, winning bid ₹100,000 => discount ₹20,000.
check("CALC-A01a", "discount = 120000 - 100000",
      Decimal("20000.00"), m.discount("120000", "100000"))

# 10% of ₹20,000 = ₹2,000 exactly.
check("CALC-A01b", "commission 10% of 20000",
      Decimal("2000.00"), m.commission("20000", CT.PERCENTAGE, "10"))

# (20000 - 2000) / 12 spots = 1500.00 exactly, no remainder.
check("CALC-A02", "dividend per spot, 12 spots, exact",
      Decimal("1500.00"), m.dividend_per_spot("20000", "2000", 12))

# 10000 / 3 = 3333.3333... -> DOWN -> 3333.33, leaving 0.01 unallocated.
check("CALC-A03a", "dividend per spot, 3 spots, rounds down",
      Decimal("3333.33"), m.dividend_per_spot("10000", "0", 3, allow_remainder=True))
check("CALC-A03b", "remainder is 0.01 (ambiguity A1)",
      Decimal("0.01"), m.dividend_remainder("10000", "0", 3))

# The oracle must refuse to assert a value it cannot justify.
expect_raises("CALC-A03c", "unacknowledged remainder raises AmbiguousRule",
              m.AmbiguousRule, m.dividend_per_spot, "10000", "0", 3)

# Commission capped at discount: FIXED 30000 against a 20000 discount.
check("CALC-A05", "fixed commission capped at discount",
      Decimal("20000.00"), m.commission("20000", CT.FIXED, "30000"))

# 3 spots x 1000 gross = 3000; dividend 1500 x 3 = 4500 => clamps at zero.
check("CALC-A04", "net due clamps at zero when dividend exceeds gross",
      Decimal("0.00"), m.net_due_after_dividend("1000", "1500", 3))

# Rounding boundary: 7% of 1000.05 = 70.0035 -> HALF_UP 2dp -> 70.00
check("CALC-R01a", "commission rounds HALF_UP at 3rd dp",
      Decimal("70.00"), m.commission("1000.05", CT.PERCENTAGE, "7"))

print("\n── CALC-P: payout ──────────────────────────────────────────────────")

check("CALC-P01", "net payout = 100000 - 12000",
      Decimal("88000.00"), m.net_payout("100000", "12000"))

check("CALC-P03", "discount components sum",
      Decimal("12000.00"), m.total_discount("8000", "3000", "1000"))

expect_raises("CALC-P04", "discount == winning is rejected",
              ValueError, m.net_payout, "100000", "100000")
expect_raises("CALC-P05", "discount > winning is rejected",
              ValueError, m.net_payout, "100000", "100001")

print("\n── CALC-F: FIFO allocation ─────────────────────────────────────────")

# Three ₹1,000 months outstanding; pay ₹2,500.
# Oldest first: m1 -> 1000 (SETTLED), m2 -> 1000 (SETTLED), m3 -> 500 (PARTIAL).
recs = [Record("chitA", 1, "1000", due_date="2026-01-01"),
        Record("chitA", 2, "1000", due_date="2026-02-01"),
        Record("chitA", 3, "1000", due_date="2026-03-01")]
r = m.apply_fifo("2500", "chitA", recs)
check("CALC-F01a", "allocations land oldest-first",
      [("chitA", 1, Decimal("1000.00")),
       ("chitA", 2, Decimal("1000.00")),
       ("chitA", 3, Decimal("500.00"))], r.allocations)
check("CALC-F01b", "month 3 left PARTIALLY_PAID", RS.PARTIALLY_PAID, r.records[2].status)
check("CALC-F01c", "no credit created", Decimal("0.00"), r.credit_added)

# Overpay: owe 1000, pay 5000 => 4000 becomes credit.
r2 = m.apply_fifo("5000", "chitA", [Record("chitA", 1, "1000", due_date="2026-01-01")])
check("CALC-C02", "overpayment becomes credit", Decimal("4000.00"), r2.credit_added)

# Cross-chit spill: chitA month1 owes 1000, chitB month1 owes 1000, pay 1500.
# 1000 to the current chit, then 500 spills to chitB.
r3 = m.apply_fifo("1500", "chitA", [
    Record("chitA", 1, "1000", due_date="2026-02-01"),
    Record("chitB", 1, "1000", due_date="2026-01-01"),
])
check("CALC-F02", "remainder spills to the other chit",
      [("chitA", 1, Decimal("1000.00")), ("chitB", 1, Decimal("500.00"))], r3.allocations)

# Credit consumed first, then cash. Owe 1000, credit 400, pay 600 => settled, no new credit.
r4 = m.apply_fifo("600", "chitA", [Record("chitA", 1, "1000", due_date="2026-01-01")],
                  credit_balance="400")
check("CALC-C03a", "credit consumed before cash", Decimal("400.00"), r4.credit_consumed)
check("CALC-C03b", "record settles exactly", RS.SETTLED, r4.records[0].status)
check("CALC-C03c", "nothing left over", Decimal("0.00"), r4.credit_added)

print("\n── CALC-C: credit at draw open ─────────────────────────────────────")

check("CALC-C01a", "credit 600 vs due 1000 -> PARTIAL_CREDIT",
      RS.PARTIAL_CREDIT, m.credit_at_draw_open("1000", "600")[0])
check("CALC-C01b", "remaining due is 400",
      Decimal("400.00"), m.credit_at_draw_open("1000", "600")[1])
check("CALC-C04", "credit >= due -> CREDIT_COVERED",
      RS.CREDIT_COVERED, m.credit_at_draw_open("1000", "1000")[0])
check("CALC-C05", "no credit -> OUTSTANDING",
      RS.OUTSTANDING, m.credit_at_draw_open("1000", "0")[0])

print("\n── CALC-T: outstanding and treasury ────────────────────────────────")

# Only OUTSTANDING/PARTIALLY_PAID count. PAYOUT_DEDUCTED must be excluded.
mixed = [
    Record("c", 1, "1000", "1000", RS.SETTLED),
    Record("c", 2, "1000", "300", RS.PARTIALLY_PAID),
    Record("c", 3, "1000", "0", RS.OUTSTANDING),
    Record("c", 4, "1000", "1000", RS.PAYOUT_DEDUCTED),
    Record("c", 5, "1000", "0", RS.WAIVED),
]
check("CALC-O01", "outstanding excludes settled/deducted/waived",
      Decimal("1700.00"), m.outstanding(mixed))

t = m.treasury_balance([
    ("IN", "CASH", "5000"),
    ("IN", "BANK", "3000"),
    ("OUT", "CASH", "1200"),
    ("OUT", "BANK", "500"),
])
check("CALC-T01a", "treasury cash", Decimal("3800.00"), t["cash"])
check("CALC-T01b", "treasury bank", Decimal("2500.00"), t["bank"])
check("CALC-T01c", "treasury total", Decimal("6300.00"), t["total"])

print("\n── CALC-S: settlement ──────────────────────────────────────────────")

# CASE_A: unpaid 5,000 + 5 future months x 8,000 = 45,000
check("CALC-S01", "CASE_A", Decimal("45000.00"),
      m.settlement_case_a("5000", 5, "8000"))

# CASE_B: paid in 15,000, no payout => fund refunds 15,000 (negative).
check("CALC-S02", "CASE_B refund is negative",
      Decimal("-15000.00"), m.settlement_case_b("15000"))

# CASE_C FAIR: unpaid 10,000 + future 40,000 − (netPayout 88,000 − disbursed 88,000... )
# Use a partial: netPayout 100,000, disbursed 60,000 => fund still owes 40,000.
# 10,000 + 40,000 − 40,000 = 10,000
check("CALC-S03a", "CASE_C FAIR", Decimal("10000.00"),
      m.settlement_case_c_fair("10000", "40000", "100000", "60000"))

# ADMIN_WIN on the same shape: disbursed 60,000 − paid-since 16,000 = 44,000.
check("CALC-S03b", "CASE_C ADMIN_WIN", Decimal("44000.00"),
      m.settlement_case_c_admin_win("60000", "16000"))

# ADMIN_WIN floors at zero rather than paying the member.
check("CALC-S03c", "ADMIN_WIN floors at zero",
      Decimal("0.00"), m.settlement_case_c_admin_win("10000", "25000"))

# Proportional reserved refund: 30,000 x (1/3) = 10,000.00
check("CALC-S04", "proportional reserved refund",
      Decimal("10000.00"), m.fund_owes_for_reserved("30000", 1, 3))

# 10,000 x (1/3) = 3333.33... HALF_UP => 3333.33
check("CALC-S05", "reserved refund rounds HALF_UP",
      Decimal("3333.33"), m.fund_owes_for_reserved("10000", 1, 3))

# post-payout rate precedence
check("CALC-S06a", "reservation override wins",
      Decimal("500.00"), m.post_payout_rate("500", "800", "1000", True))
check("CALC-S06b", "chit default when enabled",
      Decimal("800.00"), m.post_payout_rate(None, "800", "1000", True))
check("CALC-S06c", "full installment when disabled",
      Decimal("1000.00"), m.post_payout_rate(None, "800", "1000", False))

# finalNet nets off credit; exact zero is BALANCED.
check("CALC-S07a", "final net subtracts credit",
      Decimal("4000.00"), m.settlement_final("5000", "0", "1000")[0])
check("CALC-S07b", "exactly zero is BALANCED",
      True, m.settlement_final("1000", "0", "1000")[1])

print("\n── guards ──────────────────────────────────────────────────────────")

expect_raises("GUARD-01", "float input is refused", TypeError, m.money, 1000.55)
expect_raises("GUARD-02", "bid above pot is refused", ValueError,
              m.discount, "100000", "120000")

print("\n" + "=" * 68)
if FAILURES:
    print(f"ORACLE SELF-CHECK FAILED — {len(FAILURES)} case(s)\n")
    for cid, desc, exp, act in FAILURES:
        print(f"  {cid}: {desc}\n    expected {exp!r}\n    actual   {act!r}")
    sys.exit(1)
print("ORACLE SELF-CHECK PASSED — all hand-worked cases agree")
print("=" * 68)
