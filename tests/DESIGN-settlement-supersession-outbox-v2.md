# Refined design — settlement supersession and transactional outbox

Status: **Phase B settlement supersession is implemented on the local `test`
branch and its V37/V38 schema, duplicate-confirm race, supersession race,
VOIDED-history behavior, partial-disbursement compensation, payment-record
snapshots, treasury reversal and audit links were verified against disposable
MySQL 8 on 2026-09-10. The payment transactional outbox (V39), lease relay,
consumer inboxes for reporting/notification/audit, operational metrics and
audited tenant-scoped replay are implemented locally. The clean disposable
stack passed 94 cross-service tests. Production still defaults to `LEGACY`;
successful SQS delivery/redelivery must be verified in a real test environment
before switching modes. The paise migration remains a separate project.**

This document follows the emergency Phase A duplicate guard. V37's database
key permits one non-VOIDED settlement per `(tenant_id, member_id)`, while the
Phase A service still refuses every historical re-settlement—including legacy
VOIDED rows—because those rows do not contain exact reversal snapshots.

## 1. Settlement supersession (Phase B)

Implementation note: V38 follows this design with exact payment-record effect
snapshots, linked transaction/wallet/credit reversals, immutable audit events,
and a retrying member-status synchronization saga. Existing settlements are
marked `reversal_ready=false` because their original payment status cannot be
reconstructed safely; automated void/supersession refuses those legacy rows.

### Invariants

1. At most one live settlement exists for a tenant/member.
2. Confirmed settlement rows and their original transactions are immutable.
3. Corrections use linked compensating records; they never delete history.
4. Every payment-owned change is committed in one payment-database transaction.
5. Network calls do not occur inside that database transaction.
6. Member status and other cross-service effects use durable events and an
   observable saga; they cannot honestly be called one ACID transaction.
7. Treasury reconciliation remains true after the original operation, every
   partial payment, every reversal, and the replacement.

### Why the pre-Phase-B void operation was insufficient

Confirmation and later settlement payments can affect:

- `PaymentRecord.status`;
- member credit balance and credit transaction history;
- immutable settlement payment transactions;
- cash/bank treasury entries;
- member activation state in member-service;
- downstream reporting, notifications and audit;
- partially collected or partially disbursed amounts.

The pre-Phase-B void code did not store each payment record's previous status
and did not reactivate the member. Therefore legacy VOIDED rows must not unlock
automatic re-settlement. V38 marks them `reversal_ready=false`; new V38
settlements may be voided/replaced only after their exact reversal completes.

### Proposed schema (expand phase)

Add to `settlements`:

```sql
supersedes_id       VARCHAR(36) NULL,
superseded_by_id    VARCHAR(36) NULL,
settlement_version  INT NOT NULL DEFAULT 1,
supersession_reason VARCHAR(500) NULL,
superseded_at       DATETIME(6) NULL,
superseded_by_actor VARCHAR(36) NULL
```

Record every payment-record mutation made by confirmation:

```sql
CREATE TABLE settlement_payment_record_effects (
    id                    VARCHAR(36) PRIMARY KEY,
    tenant_id             VARCHAR(36) NOT NULL,
    settlement_id         VARCHAR(36) NOT NULL,
    payment_record_id     VARCHAR(36) NOT NULL,
    before_status         VARCHAR(25) NOT NULL,
    after_status          VARCHAR(25) NOT NULL,
    before_amount_paid    DECIMAL(15,2) NOT NULL,
    before_amount_due     DECIMAL(15,2) NOT NULL,
    reversed_at           DATETIME(6) NULL,
    UNIQUE KEY uq_settlement_record_effect
        (settlement_id, payment_record_id)
);
```

Add explicit reversal links rather than modifying old rows:

- `settlement_payment_transactions.reversal_of_id`, unique when non-null;
- `admin_wallet.reference_id` continues linking the transaction, while a new
  `reversal_of_entry_id` identifies the exact treasury entry reversed;
- credit transactions gain `source_settlement_id` and `reversal_of_id`.

Only after backfill/detection proves existing history is consistent should the
Phase A unique key be replaced by:

```sql
active_slot TINYINT
GENERATED ALWAYS AS (
    CASE
        WHEN superseded_by_id IS NULL AND payment_status <> 'VOIDED'
        THEN 1
        ELSE NULL
    END
) STORED,
UNIQUE KEY uq_settlement_live (tenant_id, member_id, active_slot)
```

The generated-column behavior and multiple-NULL uniqueness are covered by
`tests/e2e/test_schema_invariants.py` and the concurrent acceptance tests in
`tests/e2e/test_settlement_supersession.py`. They passed on disposable MySQL
8.0; H2 is not used for this release gate.

### Supersession transaction

The API requires the active settlement ID/version, mandatory reason and a new
idempotency key.

Inside one payment-database transaction:

1. Acquire a tenant/member serialization lock. The live-row lock plus the
   database unique key remains the final race guard.
2. Load the active settlement, effect snapshots, payment transactions, wallet
   entries and credit transactions with write locks.
3. Reject if any expected row changed outside the recorded settlement workflow.
   Do not overwrite unexpected state.
4. For every collected/disbursed settlement transaction, add an immutable
   opposite-direction settlement transaction and an exactly linked treasury
   entry. Reverse only money actually moved, including partial movement.
5. Restore consumed credit using a linked compensating credit transaction.
6. Restore each payment record from its recorded `before_*` snapshot. Never
   infer the old status from the current mutated row.
7. Mark the original settlement superseded and link it to the replacement.
8. Calculate the replacement from restored canonical state—not from
   `SETTLEMENT_CLEARED` state—and persist fresh effect snapshots.
9. Create the new live settlement and link `supersedes_id`/version.
10. Insert immutable reversal/replacement audit facts and the durable member
    status command in this same transaction. Publishing general cross-service
    events remains part of the separately approved outbox project.

After commit, member-service consumes the replacement event idempotently and
applies the intended member status. Saga state must show PENDING/APPLIED/FAILED;
a failed member update cannot be hidden as a successful supersession.

The shortcut `currentNet - (collected - disbursed)` is not used. It does not
reverse payment statuses, credit, ledger entries, member state or downstream
effects and is wrong for partial movement.

### Treasury invariant

For each settlement chain:

```text
net treasury effect
= sum(original settlement-payment wallet entries)
  + sum(linked reversal wallet entries)
  + sum(replacement settlement-payment wallet entries)
```

Every reversal pair must sum to zero by account type and currency. The global
treasury must equal the independently reconstructed ledger after every step.

### Phase B verification matrix

The disposable MySQL suite now proves the generated-column/index definition,
sequential and concurrent duplicate-confirm protection, concurrent
supersession, VOIDED history followed by one live replacement, partially and
fully collected money, partially and fully disbursed money, consumed credit
carried through a correction, a concurrent new credit write, pre-money
supersession, OUTSTANDING restoration, and refusal after an unexpected later
record mutation. Their payment-record, transaction, treasury, credit and audit
effects are compensated and replaced. Service-level tests cover exact record
restoration, linked credit compensation, idempotency conflicts, legacy row
refusal and member-status retry/lease behavior.

The broader fault-injection cases below remain recommended release-hardening
coverage; they are not claims made by the completed MySQL acceptance run:

- member-service unavailable before/after commit;
- duplicate request and same-key/different-payload behavior;
- concurrent supersession requests;
- reversal/replacement event redelivery;
- treasury reconciliation after every transition;
- immutable original rows and complete actor/reason/timestamp audit.

## 2. Transactional outbox and consumer inbox

### Identity model

- `event_id`: stable identity of one logical business event.
- `delivery_id`: identity of one destination attempt stream/outbox row.
- One event sent to three destinations has one `event_id` and three distinct
  `delivery_id` values.
- `UNIQUE(event_id, destination)` prevents duplicate delivery rows.
- The envelope always carries `event_id`. During dual publication, the legacy
  and outbox paths use the same value so inbox deduplication sees one event.

### Producer schema

```sql
CREATE TABLE event_outbox (
    delivery_id      VARCHAR(36) PRIMARY KEY,
    event_id         VARCHAR(36) NOT NULL,
    tenant_id        VARCHAR(36) NOT NULL,
    aggregate_type   VARCHAR(64) NOT NULL,
    aggregate_id     VARCHAR(64) NOT NULL,
    event_type       VARCHAR(64) NOT NULL,
    destination      VARCHAR(128) NOT NULL,
    payload          JSON NOT NULL,
    status           VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    attempts         INT NOT NULL DEFAULT 0,
    available_at     DATETIME(6) NOT NULL,
    lease_token      VARCHAR(36) NULL,
    claimed_until    DATETIME(6) NULL,
    last_error_code  VARCHAR(100) NULL,
    last_error       VARCHAR(2000) NULL,
    created_at       DATETIME(6) NOT NULL,
    published_at     DATETIME(6) NULL,
    UNIQUE KEY uq_outbox_event_destination (event_id, destination),
    INDEX idx_outbox_pending (status, available_at, delivery_id),
    INDEX idx_outbox_expired_lease (status, claimed_until, delivery_id)
);
```

The producer serializes once, generates one `event_id`, and inserts all
destination rows inside the business transaction. Serialization or insertion
failure rolls back the business operation instead of silently losing its event.

### Lease-based relay: no network call under a database lock

Claim transaction (short):

1. Begin transaction.
2. Select eligible PENDING rows with `FOR UPDATE SKIP LOCKED`, using the
   pending index. If capacity remains, select expired IN_FLIGHT rows in a
   second indexed query.
3. Assign a new random `lease_token`, set status IN_FLIGHT and
   `claimed_until = now + leaseDuration`.
4. Commit and return immutable copies of the claimed rows.

Publish phase (no database transaction or row lock):

5. Send each envelope to SQS with its stable `event_id`.

Finalize transaction (short):

6. Update by `(delivery_id, lease_token, status=IN_FLIGHT)`:
   - success: PUBLISHED, `published_at`, clear lease and error;
   - retryable failure: PENDING, increment attempts, exponential-jittered
     `available_at`, clear lease;
   - maximum attempts/non-retryable failure: FAILED, retain sanitized error.

If a worker hangs after SQS accepts the message, its lease expires and another
worker sends again. This duplicate is expected. The inbox prevents repeating
the consumer's database side effect. A stale worker cannot finalize a reclaimed
row because its lease token no longer matches.

The two claim classes are deliberately separate. The first combined `OR`
query used a filesort/range-lock plan and deadlocked two workers on MySQL 8 even
with `SKIP LOCKED`; the split queries and matching indexes passed the two-worker
acceptance test.

### Consumer inbox

```sql
CREATE TABLE event_inbox (
    event_id      VARCHAR(36) PRIMARY KEY,
    event_type    VARCHAR(64) NOT NULL,
    processed_at  DATETIME(6) NOT NULL
);
```

For reporting/audit/local notification database effects:

1. Start one consumer database transaction.
2. Insert `event_id` into inbox.
3. On duplicate primary key, acknowledge without repeating the effect.
4. Apply the database side effect.
5. Commit both together; on failure, roll both back and let SQS retry.

Email, SMS and push providers are outside this transaction and cannot be made
exactly once by the inbox. If duplicates are unacceptable, notification-service
needs its own delivery outbox plus provider idempotency keys where supported.

### Rollout sequence

1. Deploy inbox schemas and consumers first. They continue processing legacy
   envelopes without deduplication during transition; inbox deduplication starts
   only for envelopes that contain a producer-generated `event_id`.
2. Deploy producers that generate a stable ID and include it in legacy delivery.
3. Deploy outbox tables/relay with mode `legacy`.
4. Optional short `dual` observation: legacy and outbox use the same event ID;
   inboxes make the second arrival harmless.
5. Switch to `outbox` only after pending/failed metrics and consumer health are
   verified. Rollback returns to `legacy` without deleting outbox rows.
6. Drain/reconcile rows created during transitions before removing legacy code.

### Operations

Implemented payment-producer metrics:

- pending + in-flight count and age of oldest unpublished event;
- current failed count;
- cumulative publish, retry, terminal-failure and stale-finalization counters.

Still required at the platform/monitoring layer: event-type/destination labels,
publish latency, inbox duplicate/failure metrics, dashboards and alert routing.

Required alerts:

- any FAILED row;
- oldest pending beyond the delivery SLO;
- sustained retry spike;
- expired-lease growth;
- consumer DLQ depth or processing failure spike.

Replay is a `ROLE_ADMIN` action scoped by the caller's tenant. It changes FAILED
to PENDING with a new availability time but preserves `event_id`,
`delivery_id`, payload and the delivery's failure history. Every replay records
actor, mandatory reason and timestamp in `event_outbox_replay_audit`.

Errors store exception class/stable code and a redacted/truncated message—never
credentials, authorization headers, provider tokens, full URLs or payloads.

Retention proposal:

- PUBLISHED outbox rows: 30 days, then purge in bounded batches;
- FAILED rows: retain until resolved plus 90 days;
- inbox rows: at least SQS retention + DLQ/redrive/replay window (proposed 30
  days), purged only after no producer replay can reference them;
- metrics/audit aggregates retained according to the financial audit policy.

### Verification status and remaining real-infrastructure tests

- **Passed on disposable MySQL 8:** clean V1-V39 migration, stable
  event/destination identity, two workers claiming without overlap, and
  expired-lease reclaim with stale-token finalize rejection.
- **Passed with the disposable stack and unreachable external services:**
  business commit creates durable deliveries, retries exhaust to FAILED, error
  text is sanitized, and the ledger stays committed.
- **Passed in service tests:** SQS is invoked after the claim transaction,
  commit/rollback publication timing, stable dual-publish ID, consumer duplicate
  suppression, consumer failure propagation, and tenant-scoped audited replay.

Still required with a real non-production SQS endpoint:

- slow/hung SQS call does not hold a database row lock;
- crash after claim and before publish;
- crash after publish and before success update;
- lease expiry/reclaim after a real process crash and SQS interaction;
- dual publication deduplicates at every running consumer;
- consumer database failure rolls back inbox and side effect together;
- alert delivery and retention cleanup;
- provider-facing notification deduplication where required.

## 3. Paise migration guardrails (separate project)

No paise code or schema change belongs in Phase A or the outbox work.

For each money field:

1. Add nullable paise column; all current instances still read decimal.
2. Deploy dual-write code and wait until every old instance is gone.
3. Backfill in bounded batches and continuously reconcile
   `paise = ROUND(decimal * 100)`.
4. Validate scale and explicit BIGINT/Java `long` range before every conversion.
5. Flip reads only after all instances dual-write and reconciliation is zero.
6. If any rollback starts an older decimal-only version, flip reads back,
   backfill/reconcile again, and only then restore paise reads.
7. Stop decimal writes and drop decimal columns only after the agreed retention
   and rollback window.
8. Version API conversion separately after storage is stable; web/mobile do not
   change in lockstep with database storage.
