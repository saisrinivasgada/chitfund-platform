# Design for approval — settlement versioning, outbox/inbox, paise migration

Nothing here is implemented. Three designs, in the order I would build them.

Before the designs: **a correction to my own severity call.**

---

## 0. R5 upgraded to Critical — I was wrong

I previously told you the duplicate-settlement defect had "no demonstrated money impact, all
reachable scenarios compute net 0". That was wrong. I had only traced the CASE_A path.

The CASE_B path double-refunds. Here is the chain, all in `SettlementService.java`:

```
:347   totalPaidIn = Σ amountPaid over ALL records, regardless of status
:435   CASE_B1  netAmount = totalPaidIn.negate()
:439   CASE_B2  netAmount = totalPaidIn.negate()
```

and what `confirm()` changes when it runs (`:186-190`):

```java
// only OUTSTANDING / PARTIALLY_PAID are touched, and only their *status*
rec.setStatus(PaymentRecordStatus.SETTLEMENT_CLEARED);
```

`amountPaid` is never zeroed and `totalPaidIn` filters on nothing. So after a member is settled once,
`totalPaidIn` is **byte-for-byte identical**, and a second confirm computes the same negative net and
refunds the whole amount again.

The guard does not stop it, because it treats a *finished* settlement as no obstacle (`:154-161`):

```java
List<SettlementPaymentStatus> terminalStatuses = List.of(
        FULLY_COLLECTED, FULLY_DISBURSED, BALANCED, VOIDED);
if (settlementRepository.existsByMemberIdAndTenantIdAndPaymentStatusNotIn(
        memberId, tenantId, terminalStatuses)) {
    throw new BusinessException(ErrorCode.SETTLEMENT_ALREADY_EXISTS);
}
```

Read it carefully: it only blocks a settlement that is **still in progress**. `VOIDED` belongs in that
list — a voided settlement should allow a retry. The other three do not. A member who has been fully
refunded is in `FULLY_DISBURSED`, which the check explicitly permits.

**Worked example.** Member P15, CASE_B2, paid 8 × ₹1,000 = ₹8,000, never won, leaves the chit.

| | net | treasury |
|---|---|---|
| settle #1 | −₹8,000 | −₹8,000 |
| settle #2 | −₹8,000 | −₹16,000 |

The fund pays out ₹16,000 against ₹8,000 received. Nothing in the schema prevents a third.

**Two independent failures, both needing a fix:**

- **R5a — logic.** Completed settlements are treated as non-blocking. Reachable by one admin
  clicking confirm twice; no race required.
- **R5b — race.** `existsBy...` is an unlocked read with no unique constraint behind it. Two
  concurrent confirms both read `false` and both insert.

Fixing R5a alone still leaves the race. Fixing R5b alone still leaves the double click.

I have not reproduced this against a running stack — Docker is down on this machine. It is read from
source, and `tests/e2e/test_settlement_race.py` asserts it as `xfail`. **Treat it as unconfirmed
until it runs.** Reproducing it is step 1 below.

---

## 1. Settlement versioning

### The rule to encode

A member has **at most one settlement that is not superseded**, per tenant. Re-settling is allowed
and sometimes necessary — but it must supersede the prior one and account for what that one already
moved, rather than starting from a clean slate.

### Schema

```sql
-- V36: expand only. Nullable column, no backfill of existing rows' meaning.
ALTER TABLE settlements
  ADD COLUMN supersedes_id  VARCHAR(36) NULL,
  ADD COLUMN superseded_by  VARCHAR(36) NULL,
  ADD COLUMN version        INT NOT NULL DEFAULT 1;

-- The actual guard. A generated column is used because MySQL has no partial index:
-- it is the member id while the row is live, and NULL once superseded or voided.
-- NULLs do not collide in a UNIQUE index, so superseded rows stop competing.
ALTER TABLE settlements
  ADD COLUMN active_member_key VARCHAR(36)
      GENERATED ALWAYS AS (
        CASE WHEN superseded_by IS NULL AND payment_status <> 'VOIDED'
             THEN CONCAT(tenant_id, ':', member_id) END
      ) STORED,
  ADD CONSTRAINT uq_settlement_active UNIQUE (active_member_key);
```

The unique constraint is the part that actually matters. Application checks lose races; this one is
enforced by the database and cannot be lost to concurrency, a second pod, or a direct SQL insert.

**Backfill risk, stated honestly:** if production already contains a member with two live
settlements, this `ALTER` **fails**. That is the correct outcome — it means real money already moved
twice and a human must decide the correction. The deploy must run a detection query first:

```sql
SELECT tenant_id, member_id, COUNT(*) c
FROM settlements
WHERE payment_status <> 'VOIDED'
GROUP BY tenant_id, member_id HAVING c > 1;
```

**I have not run this against production and will not without your say-so.** Its result decides
whether this is a clean schema change or an incident.

### Service change

```java
@Transactional
public SettlementResponse confirm(ConfirmSettlementRequest request, UUID adminId) {
    // 1. Lock the member's settlement line, not just read it. Serialises concurrent
    //    confirms for this member; different members stay parallel.
    Optional<Settlement> live = settlementRepository
            .findLiveForUpdate(memberId, tenantId);   // SELECT ... FOR UPDATE

    // 2. A live settlement blocks, whatever its stage. Finished is not "absent".
    if (live.isPresent() && !request.isSupersede()) {
        throw new BusinessException(ErrorCode.SETTLEMENT_ALREADY_EXISTS,
            "This member was already settled on " + live.get().getSettledAt() +
            ". To settle again, supersede the existing settlement — the new one will "
            + "account for what the first already paid or collected.");
    }
    ...
}
```

`findLiveForUpdate` is `WHERE superseded_by IS NULL AND payment_status <> 'VOIDED'` with
`@Lock(PESSIMISTIC_WRITE)`.

### Supersede arithmetic — the part that is easy to get wrong

A supersede must not recompute from zero. The prior settlement already moved money.

```
netAmount(v2) = computeNet(currentState) − alreadyMoved(v1)

alreadyMoved(v1) = v1.collectedAmount − v1.disbursedAmount
```

Both columns already exist on `Settlement` (`:98`, `:103`). So superseding a fully-refunded ₹8,000
settlement with an identical recomputation yields `−8000 − (0 − 8000) = 0` — balanced, no second
refund. That is the invariant worth testing above all others.

### Why not just make BALANCED terminal?

That is the one-line version, and it is not enough. It closes the double-click but leaves the race
(R5b), leaves no audit link between the two settlements, and makes legitimate re-settlement
impossible after a correction. The unique constraint is what makes this durable.

### Tests before the change lands

1. Reproduce the double refund on the live stack and watch the treasury go to −16,000. Convert
   `test_settlement_race.py` from `xfail` to a passing assertion **only after** the fix.
2. Concurrent confirm × 2 — exactly one succeeds, the other gets a clear conflict.
3. Supersede an identical settlement → net 0, treasury unchanged.
4. Void then re-settle → still allowed (do not regress the VOIDED case).
5. `INV-8` treasury reconciliation after each.

---

## 2. Transactional outbox / consumer inbox

### What is there now

`PaymentEventPublisher.sendTo` (`:60-72`):

```java
private void sendTo(String queue, String eventType, Object event) {
    CompletableFuture.runAsync(() -> {
        try {
            sqsTemplate.send(queue, envelope);
        } catch (Exception e) {
            log.warn("Failed to publish {} to queue {}: {}", eventType, queue, e.getMessage());
        }
    });
}
```

A dropped event is a `WARN` line. Nothing retries it, nothing detects it later.

**And there is a second bug I had not previously reported.** Most call sites correctly use
`publishAfterCommit(...)`, but two do not:

```
ChitMonthDrawService.java:140   inside @Transactional openDraw(...)
ChitMonthDrawService.java:382   inside @Transactional skipDraw(...)
```

Combined with `runAsync`, those two publish on a pool thread that can run **before the transaction
commits** — and will still publish if it **rolls back**. Opening a draw notifies every member of the
chit. So a failed `openDraw` can send the whole chit a notification about a month that does not
exist, and reporting counts a cycle the ledger never got.

That one is a genuine fix-now, independent of the outbox, and much smaller.

### Design

**Producer side — one table per service, written in the business transaction.**

```sql
CREATE TABLE event_outbox (
  id             VARCHAR(36) PRIMARY KEY,
  tenant_id      VARCHAR(36)  NOT NULL,
  aggregate_type VARCHAR(64)  NOT NULL,
  aggregate_id   VARCHAR(36)  NOT NULL,
  event_type     VARCHAR(64)  NOT NULL,
  destination    VARCHAR(128) NOT NULL,   -- one row per queue; fan-out is explicit
  payload        JSON         NOT NULL,
  status         VARCHAR(16)  NOT NULL DEFAULT 'PENDING',
  attempts       INT          NOT NULL DEFAULT 0,
  next_attempt_at DATETIME    NOT NULL,
  last_error     TEXT         NULL,
  created_at     DATETIME     NOT NULL,
  published_at   DATETIME     NULL,
  KEY idx_claim (status, next_attempt_at)
);
```

The insert happens in the **same transaction** as the payment. Commit together or not at all — which
is exactly what the two `ChitMonthDrawService` sites get wrong today, and the outbox makes it
structurally impossible to get wrong again.

**Relay — a scheduled worker, no CDC, no Debezium.**

```java
@Scheduled(fixedDelay = 2000)
@Transactional
public void drain() {
    // SKIP LOCKED so multiple pods drain in parallel without contending or
    // double-sending. MySQL 8 has it; the prod DB is 8.0.
    List<OutboxEvent> batch = repo.claimBatch(100);   // FOR UPDATE SKIP LOCKED
    for (OutboxEvent e : batch) {
        try {
            sqsTemplate.send(e.getDestination(), e.envelope());
            e.markPublished();
        } catch (Exception ex) {
            e.backoff(ex);   // attempts++, next_attempt_at = now + min(2^attempts, 300)s
        }
    }
}
```

After `attempts >= 10` the row goes to `FAILED` and stays. It is not deleted — a `FAILED` outbox row
is the alert, and the reason the current bug is invisible is that no such row exists.

**Consumer side — inbox, because SQS is at-least-once.**

```sql
CREATE TABLE event_inbox (
  event_id     VARCHAR(36) PRIMARY KEY,   -- producer's outbox id, carried in the envelope
  event_type   VARCHAR(64) NOT NULL,
  processed_at DATETIME    NOT NULL
);
```

Handler inserts the id first, in the same transaction as its side effect. Duplicate delivery hits the
primary key, the handler treats it as already-done and acks. This is what stops a redelivered
`PaymentCompletedEvent` from double-counting in reporting or sending a member a second push.

This matters *more* after adding the outbox, because retries make duplicates common rather than rare.

### Delivery semantics, stated plainly

At-least-once, with dedupe at the consumer. Not exactly-once — that is not available across a
database and SQS. What changes is that a lost event becomes a visible `FAILED` row instead of a log
line nobody reads.

### Rollout

Behind `chitwise.outbox.enabled`, default `false`. Enable per service, payment first. Both paths can
run at once during the transition — the inbox makes double publishing harmless, which is what makes
the cutover safe.

### Order I would build it

1. **`publishAfterCommit` on the two `ChitMonthDrawService` sites.** Hours, not days. Removes a live
   phantom-notification bug and needs none of the above.
2. Outbox table + relay in payment-service, flag off.
3. Inbox in reporting + notification consumers.
4. Flip the flag in the test stack, run Phase 6 failure injection against it, then production.

Step 1 is worth doing regardless of whether you approve 2–4.

---

## 3. Paise migration — approved, expand/contract

Target: money is `BIGINT` paise everywhere. Billing already does this
(`amountPaise`); chit money is `DECIMAL(15,2)`. Getting to one representation is right — doing it in
one migration across ~40 columns in 5 schemas is not.

**Per column, four deploys.** Money columns are never rewritten in place.

| Step | Change | Reversible by |
|---|---|---|
| 1. expand | add `x_paise BIGINT NULL`; write **both**, read `x` | dropping the new column |
| 2. backfill | chunked `UPDATE ... SET x_paise = ROUND(x * 100)`; verify every row round-trips | it is additive; nothing reads it yet |
| 3. flip | read `x_paise`, still write both | flip the read back — one config change |
| 4. contract | stop writing `x`, drop it | **not reversible** — only after a full retention window |

Steps 1–3 are each independently rollback-able, which satisfies the deploy rule you set: nothing
touches production without a fast way back.

**Order — least risk first, so the pattern is proven before it touches the ledger:**

1. `admin_wallet` (treasury; append-only, easiest to verify by re-summing)
2. `payouts` / payout transactions
3. `settlements` + `settlement_chit_items`
4. `payment_records`, `payment_batches`, `payment_allocations` (largest, most read paths)

**The conversion is the risky step, so it gets its own guard.** `ROUND(x * 100)` on a `DECIMAL` is
exact, but the invariant must be asserted rather than assumed:

```sql
SELECT COUNT(*) FROM payment_records WHERE amount_paid_paise <> ROUND(amount_paid * 100);
-- must be 0 before step 3 flips any read
```

And the oracle already refuses `float` (`chitmath.py:money`), so the reference model cannot drift
even if a service does.

**What I would not do:** convert the API contract at the same time. Responses keep returning decimal
strings until the storage migration is fully contracted. Otherwise every client — web, mobile, and
anything already installed on a member's phone — has to change in lockstep with a database migration,
and mobile cannot be rolled back at all once an app version is out.

**Effort, honestly:** this is weeks of small deploys, not a sprint. The payoff is one money type and
no `BigDecimal`-scale surprises. The cost is that steps 1–3 leave two columns holding the same value,
and any new write path added during that window must write both or it silently diverges. A test that
asserts the two columns agree, run in CI, is what keeps that from happening.

---

## What I need from you

1. **Reproduce R5 first?** I would rather show you the treasury hitting −16,000 on the disposable
   stack than have you approve a fix for a defect I have only read.
2. **The production duplicate-settlement query** in §1 — may I run it read-only? It decides whether
   the schema change is routine or an incident.
3. **`publishAfterCommit` on the two draw sites** — small, self-contained, fixes a live bug. May I do
   that one now, ahead of the rest?
