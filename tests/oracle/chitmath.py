"""
Independent reference model for ChitWise financial calculations.

This module is the *test oracle*. It re-implements the business rules from the
specification, deliberately without importing or calling the application. If a
test compared application output against application output it would prove only
self-consistency, so nothing here may derive an expected value from a service
response or a database row.

Every rule cites the source it was derived from, so a reviewer can check the
oracle against the code rather than trusting it. Where the code's intent is
ambiguous the ambiguity is raised as an exception rather than guessed — see
`dividend_per_spot` and `AmbiguousRule`.

Money is `Decimal` throughout, quantised to 2dp, matching the services'
`BigDecimal(precision=15, scale=2)` columns. Never use float here.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal, ROUND_HALF_UP, ROUND_DOWN
from enum import Enum
from typing import Iterable, Sequence

# Two decimal places, matching @Column(precision = 15, scale = 2).
CENTS = Decimal("0.01")
ZERO = Decimal("0.00")


def money(value) -> Decimal:
    """Coerce to a 2dp Decimal. Rejects float to avoid binary rounding drift."""
    if isinstance(value, float):
        raise TypeError(
            f"refusing float {value!r} — use str/int/Decimal so the oracle "
            "cannot inherit binary floating-point error"
        )
    return Decimal(value).quantize(CENTS, rounding=ROUND_HALF_UP)


class AmbiguousRule(Exception):
    """
    Raised where the code's behaviour is observable but its *intent* is not
    settled, so no correct expected value can be asserted yet.
    """


# ─── Enums mirrored from the services ────────────────────────────────────────

class RecordStatus(str, Enum):
    """PaymentRecordStatus — payment-service."""
    OUTSTANDING = "OUTSTANDING"
    PARTIALLY_PAID = "PARTIALLY_PAID"
    SETTLED = "SETTLED"
    WAIVED = "WAIVED"
    PAYOUT_DEDUCTED = "PAYOUT_DEDUCTED"
    SETTLEMENT_CLEARED = "SETTLEMENT_CLEARED"
    CREDIT_COVERED = "CREDIT_COVERED"
    PARTIAL_CREDIT = "PARTIAL_CREDIT"


class CommissionType(str, Enum):
    PERCENTAGE = "PERCENTAGE"
    FIXED = "FIXED"


class SettlementMode(str, Enum):
    """Only meaningful for a partially-disbursed payout (CASE_C)."""
    FAIR = "FAIR"
    ADMIN_WIN = "ADMIN_WIN"


# ─── Auction: discount, commission, dividend ─────────────────────────────────
# Source: AuctionService.java:246-269

def discount(scheduled_payout, won_amount) -> Decimal:
    """discount = scheduledPayoutAmount − wonAmount  (AuctionService.java:246)"""
    d = money(scheduled_payout) - money(won_amount)
    if d < ZERO:
        raise ValueError(f"bid {won_amount} exceeds scheduled payout {scheduled_payout}")
    return d


def commission(disc, commission_type: CommissionType, commission_value) -> Decimal:
    """
    PERCENTAGE: discount x (value/100), HALF_UP to 2dp
    FIXED:      value
    Both capped at the discount, so distributable can never go negative.
    (AuctionService.java:250-260)
    """
    disc = money(disc)
    if commission_value is None or money(commission_value) <= ZERO:
        return ZERO
    value = money(commission_value)
    if commission_type == CommissionType.PERCENTAGE:
        raw = (disc * value) / Decimal(100)
        c = raw.quantize(CENTS, rounding=ROUND_HALF_UP)
    else:
        c = value
    return min(c, disc)


def dividend_per_spot(disc, comm, total_spots: int, *, allow_remainder=False) -> Decimal:
    """
    dividendPerSpot = (discount − commission) / totalSpots, ROUND_DOWN
    (AuctionService.java:266-269)

    ROUND_DOWN means the distributed total can be less than the distributable
    amount. The code stores only `dividendPerSpot` and never records where the
    shortfall goes, so `discount == commission + sum(dividends)` does not hold.

    That shortfall is real money — up to (total_spots - 1) x ₹0.01 per auction —
    and its owner is undecided (ambiguity A1). Callers must opt in via
    `allow_remainder=True` to acknowledge they are asserting the *current*
    behaviour rather than a confirmed rule.
    """
    disc, comm = money(disc), money(comm)
    if total_spots <= 0:
        return ZERO
    distributable = disc - comm
    per_spot = (distributable / Decimal(total_spots)).quantize(CENTS, rounding=ROUND_DOWN)
    rem = distributable - (per_spot * total_spots)
    if rem > ZERO and not allow_remainder:
        raise AmbiguousRule(
            f"dividend leaves an unallocated remainder of {rem} "
            f"(distributable={distributable}, spots={total_spots}). "
            "Blocked on ambiguity A1: does the org keep it, does it go to the "
            "winner, or is it distributed largest-remainder? Pass "
            "allow_remainder=True to assert current behaviour regardless."
        )
    return per_spot


def dividend_remainder(disc, comm, total_spots: int) -> Decimal:
    """The shortfall left by rounding the per-spot dividend down."""
    disc, comm = money(disc), money(comm)
    if total_spots <= 0:
        return ZERO
    distributable = disc - comm
    per_spot = (distributable / Decimal(total_spots)).quantize(CENTS, rounding=ROUND_DOWN)
    return distributable - (per_spot * total_spots)


def dividends_for_members(disc, comm, member_spots: Sequence[int]) -> list:
    """
    Per-member dividend once the rounding shortfall has been redistributed.

    Resolved 2026-09-10 (A1): the stranded paise belong to the members, not the
    fund, so they are handed out one per member — largest remainder — until they
    run out. `member_spots` must already be in the same stable order the service
    uses (member id ascending).

    Guarantees `sum(result) == discount - commission` whenever the shortfall is
    no larger than one paisa per member, which is the only case rounding down can
    produce.
    """
    disc, comm = money(disc), money(comm)
    total_spots = sum(member_spots)
    if total_spots <= 0:
        return [ZERO for _ in member_spots]

    distributable = disc - comm
    per_spot = (distributable / Decimal(total_spots)).quantize(CENTS, rounding=ROUND_DOWN)

    amounts = [per_spot * s for s in member_spots]
    shortfall = distributable - sum(amounts, ZERO)
    spare_paise = int((shortfall / CENTS).to_integral_value())
    # One paisa each, capped at the member count — a bigger gap means the inputs
    # disagree, and inventing a discount would be worse than leaving it.
    for i in range(min(spare_paise, len(amounts))):
        amounts[i] += CENTS
    return amounts


def net_due_after_dividend(gross_installment, per_spot_dividend, spots: int) -> Decimal:
    """
    gross    = grossInstallmentAmount x spots
    dividend = dividendPerSpot x spots
    netDue   = max(0, gross − dividend)      (ChitMonthDrawService.java:182-230)
    """
    gross = money(gross_installment) * spots
    div = money(per_spot_dividend) * spots
    return max(ZERO, gross - div)


# ─── Payout ──────────────────────────────────────────────────────────────────
# Source: PayoutService.java:71-97

def net_payout(winning_amount, discount_amount) -> Decimal:
    """
    netPayoutAmount = winningAmount − discountAmount  (PayoutService.java:77)

    The service rejects discount >= winning, so a payout can never be zero or
    negative; we mirror that rather than silently returning a bad number.
    """
    w, d = money(winning_amount), money(discount_amount)
    if d >= w:
        raise ValueError(
            f"discount {d} must be strictly less than winning amount {w} "
            "(PayoutService.java:71-75)"
        )
    return w - d


def total_discount(installment_settlement=0, cross_chit_settlement=0, manual_adjustment=0) -> Decimal:
    """The three components the payout discount decomposes into."""
    return (money(installment_settlement)
            + money(cross_chit_settlement)
            + money(manual_adjustment))


# ─── Payment records and FIFO allocation ─────────────────────────────────────

@dataclass
class Record:
    """One (member, chit, month) obligation — a row of payment_records."""
    chit_id: str
    month: int
    amount_due: Decimal
    amount_paid: Decimal = ZERO
    status: RecordStatus = RecordStatus.OUTSTANDING
    due_date: str = ""          # ISO date; orders cross-chit spill

    def __post_init__(self):
        self.amount_due = money(self.amount_due)
        self.amount_paid = money(self.amount_paid)

    @property
    def owed(self) -> Decimal:
        return max(ZERO, self.amount_due - self.amount_paid)


def status_for(amount_due, amount_paid) -> RecordStatus:
    """paid >= due -> SETTLED; paid > 0 -> PARTIALLY_PAID; else OUTSTANDING."""
    due, paid = money(amount_due), money(amount_paid)
    if paid >= due:
        return RecordStatus.SETTLED
    if paid > ZERO:
        return RecordStatus.PARTIALLY_PAID
    return RecordStatus.OUTSTANDING


ALLOCATABLE = (RecordStatus.OUTSTANDING, RecordStatus.PARTIALLY_PAID)


@dataclass
class FifoResult:
    allocations: list = field(default_factory=list)   # (chit_id, month, amount)
    credit_consumed: Decimal = ZERO
    credit_added: Decimal = ZERO
    records: list = field(default_factory=list)


def apply_fifo(batch_amount, current_chit_id: str, records: Sequence[Record],
               credit_balance=ZERO) -> FifoResult:
    """
    Reference implementation of PaymentService.applyFifo (:606-668).

      1. consume member credit, up to total owed across *all* chits (A3)
      2. allocate oldest month first within the current chit
      3. spill to other chits ordered by (due_date, month)
      4. any remainder becomes new credit

    Returns the allocations and the resulting record states, so a test can
    compare per-record rather than only on totals — a total can match while the
    money landed on the wrong months.
    """
    pool = money(batch_amount)
    credit = money(credit_balance)
    recs = [Record(r.chit_id, r.month, r.amount_due, r.amount_paid, r.status, r.due_date)
            for r in records]

    total_owed = sum((r.owed for r in recs if r.status in ALLOCATABLE), ZERO)
    credit_used = min(credit, total_owed)
    pool += credit_used

    def allocate(subset: Iterable[Record], result: FifoResult):
        nonlocal pool
        for r in subset:
            if pool <= ZERO:
                break
            if r.status not in ALLOCATABLE:
                continue
            take = min(pool, r.owed)
            if take <= ZERO:
                continue
            r.amount_paid += take
            r.status = status_for(r.amount_due, r.amount_paid)
            pool -= take
            result.allocations.append((r.chit_id, r.month, take))

    out = FifoResult(credit_consumed=credit_used)

    current = sorted((r for r in recs if r.chit_id == current_chit_id),
                     key=lambda r: r.month)
    allocate(current, out)

    others = sorted((r for r in recs if r.chit_id != current_chit_id),
                    key=lambda r: (r.due_date, r.month))
    allocate(others, out)

    out.credit_added = pool if pool > ZERO else ZERO
    out.records = recs
    return out


def credit_at_draw_open(amount_due, credit_balance):
    """
    Credit auto-applied when a month opens (ChitMonthDrawService.java:89-107).
    Returns (status, remaining_due, credit_used).
    """
    due, credit = money(amount_due), money(credit_balance)
    used = min(credit, due)
    remaining = due - used
    if used >= due and due > ZERO:
        return RecordStatus.CREDIT_COVERED, ZERO, used
    if used > ZERO:
        return RecordStatus.PARTIAL_CREDIT, remaining, used
    return RecordStatus.OUTSTANDING, due, ZERO


# ─── Outstanding and treasury ────────────────────────────────────────────────

def outstanding(records: Iterable[Record]) -> Decimal:
    """
    sum(amountDue − amountPaid) over OUTSTANDING/PARTIALLY_PAID only.
    Deliberately excludes PAYOUT_DEDUCTED, SETTLED, WAIVED, SETTLEMENT_CLEARED,
    CREDIT_COVERED (PaymentRecordRepository.java:68-69).
    """
    return sum((r.owed for r in records if r.status in ALLOCATABLE), ZERO)


def treasury_balance(entries: Iterable[tuple]) -> dict:
    """
    entries: (direction, account, amount) where direction is 'IN'/'OUT'
    and account is 'CASH'/'BANK'.  (AdminWalletService.java:52-70)
    """
    cash = bank = ZERO
    for direction, account, amount in entries:
        amt = money(amount)
        signed = amt if direction == "IN" else -amt
        if account == "CASH":
            cash += signed
        elif account == "BANK":
            bank += signed
        else:
            raise ValueError(f"unknown account type {account!r}")
    return {"cash": cash, "bank": bank, "total": cash + bank}


# ─── Settlement ──────────────────────────────────────────────────────────────
# Source: SettlementService.java:340-499

def post_payout_rate(reservation_override, chit_default, chit_installment,
                     post_payout_enabled: bool) -> Decimal:
    """reservation override -> chit default (if enabled) -> full installment (:572-580)"""
    if reservation_override is not None:
        return money(reservation_override)
    if post_payout_enabled and chit_default is not None:
        return money(chit_default)
    return money(chit_installment)


def fund_owes_for_reserved(total_paid_in, reserved_slots: int, total_active_slots: int) -> Decimal:
    """totalPaidIn x (reserved/active), HALF_UP (:372-384)"""
    paid = money(total_paid_in)
    if reserved_slots <= 0 or total_active_slots <= 0:
        return ZERO
    if reserved_slots >= total_active_slots:
        return paid
    ratio = Decimal(reserved_slots) / Decimal(total_active_slots)
    return (paid * ratio).quantize(CENTS, rounding=ROUND_HALF_UP)


def settlement_case_a(unpaid_dues, future_months: int, post_rate, fund_owes_reserved=ZERO) -> Decimal:
    """net = unpaid + (futureMonths x postRate) − fundOwesForReserved  (:448-464)"""
    return (money(unpaid_dues)
            + (money(post_rate) * future_months)
            - money(fund_owes_reserved))


def settlement_case_b(total_paid_in) -> Decimal:
    """No payout: fund refunds everything paid in. Negative = org owes.  (:427-440)"""
    return -money(total_paid_in)


def settlement_case_c_fair(unpaid_dues, future_installments, net_payout_amount, disbursed) -> Decimal:
    """net = unpaid + future − (netPayout − disbursed)  (:487)"""
    still_owed_by_fund = money(net_payout_amount) - money(disbursed)
    return money(unpaid_dues) + money(future_installments) - still_owed_by_fund


def settlement_case_c_admin_win(disbursed, installments_paid_since_payout) -> Decimal:
    """
    net = max(0, disbursed − installmentsPaidSincePayout)   (:494)

    Forgives the undisbursed balance, so this can leave the member materially
    worse off than FAIR on identical inputs — ambiguity A2.
    """
    return max(ZERO, money(disbursed) - money(installments_paid_since_payout))


def settlement_final(base_net, adjustment=ZERO, credit_balance=ZERO):
    """
    finalNet = baseNet + adjustment − creditBalance; == 0 -> BALANCED  (:239-240)
    Returns (final_net, is_balanced).
    """
    final = money(base_net) + money(adjustment) - money(credit_balance)
    return final, final == ZERO
