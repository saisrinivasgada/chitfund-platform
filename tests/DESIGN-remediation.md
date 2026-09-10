# ChitWise — Remediation Design (for approval)

Nine deliverables as requested. No risky work started. One item is **blocked on evidence I cannot
read** (§1), and one of your decisions has a consequence worth confirming before it is built (§6).

---

## 1. Migration audit

### 1.1 Finding: editing applied migrations is an established pattern here, not a one-off

I reported editing two migrations. The audit found **six**, four of them predating me:

| Service | Version | Edited in | Original checksum | Current checksum | Reason given |
|---|---|---|---|---|---|
| payment | V10 | `36fc250` (mine) | `-853368420` | `1043259555` | make idempotent for empty DB |
| payment | V26 | `36fc250` (mine) | `1625561656` | `1411015242` | make idempotent for empty DB |
| payment | V15 | `ef9e456` | `1448170671` | `1074867122` | "idempotent to survive partial runs" |
| payment | V16 | `ef9e456` | `-295630367` | `-340283361` | "idempotent to survive partial runs" |
| payment | V27 | `eb1832a`, `fbf9d5d` | `-1099165799` | `1243283301` | **"repair failed V27 migration blocking payment service startup"** |
| user | V131 | `6345d08` | `1958266532` | `-595536297` | "fix syntax for MySQL compatibility" |

Checksums computed with Flyway's own algorithm (CRC32 per line, terminators excluded), comparing the
commit *before* each edit against `HEAD`. **All six differ**, so every one would fail validation if
`validate-on-migrate` were enabled.

V27 is the clearest illustration of the loop your policy closes: a migration failed in production,
the failure row was deleted by the deploy, and the file was edited so the retry would pass.

### 1.2 Blocked: which of these production actually executed

Your rule keys on presence in production `flyway_schema_history`. I cannot read it — SSH is blocked
by a safety classifier in this session — and you instructed me not to guess.

**Please run this. It is read-only and touches no business data:**

```bash
ssh -i chitfund-key.pem ec2-user@3.21.196.51 \
 'H=$(sed -n "s/^DB_HOST=//p" /app/.env|head -1); P=$(sed -n "s/^DB_PASSWORD=//p" /app/.env|head -1);
  for db in chitfund_payment chitfund_user chitwise_management; do
    echo "=== $db ===";
    mysql -h "$H" -u chitfund -p"$P" "$db" -e \
      "SELECT installed_rank,version,description,checksum,success,installed_on
       FROM flyway_schema_history ORDER BY installed_rank;" 2>/dev/null || echo "(no such schema)";
  done'
```

With that output I can complete the audit and state, per migration, whether the original must be
restored.

### 1.3 Proposed action, pending that evidence

| Case | Action |
|---|---|
| Version present in prod history | **Restore original committed contents.** Fix behaviour in a new forward-only migration (`V36+` payment, `V152+` user) |
| Version absent from prod history | May be corrected in place before release |

For my two: restore `V10` and `V26` to their pre-`36fc250` contents, then add **`V36__make_tenant_id_idempotent.sql`** doing the guarded work. Net schema result identical; history immutable.

For V15/V16/V27/V131: same rule. If prod ran them, the edits are already permanent facts — restoring the files makes the *repository* honest again, and a forward migration reconciles any behavioural difference.

**Guard against recurrence:** a CI step that recomputes each migration's checksum against a committed
manifest and fails on change. Cheap, and turns this from a recurring practice into a blocked action.

### 1.4 Management-service V9 — evidence it never ran in production

V9 (`disable_seeded_credential_and_add_bootstrap`) was added in `f7c10a6`, reverted in `dcb3567`,
reappeared in `b454135`, and was finally removed in `3f06aed`. It is absent today (V3–V8 only).

Three independent facts say it never executed in production:

1. **management-service had no Dockerfile and no CI until `d533f51`** — it could not be built or
   deployed before that.
2. **The `chitwise_management` database did not exist until `b0ec85f`** (tonight), which added
   `CREATE DATABASE IF NOT EXISTS` to the deploy. Flyway had no schema to run against.
3. **`3f06aed` removed V9 before either of those**, so by the time the service could first deploy,
   V9 was no longer in the codebase.

**Conclusion: V9 never executed in production.** Deleting it was correct and no corrective migration
is needed. The query in §1.2 confirms this — `chitwise_management` history should show V3–V8 with no
version 9.

If that query *does* show a version 9 row, the correct response is a forward corrective migration
re-enabling EMP-001, not a file deletion — and I would come back for direction rather than act.

**Confirmed unchanged per your direction:** V3 seed retained (you will rotate `Password@1` before
launch); OTP storage remains unhashed; employee invitation tokens remain hashed.

---

## 2. Flyway history deletion — exact location

**Exactly one site**, verified across all workflows, scripts, Java and SQL:

```
.github/workflows/deploy.yml:532
  -e "DELETE FROM flyway_schema_history WHERE success = 0;" 2>/dev/null || true
```

It runs for all nine schemas on every backend deploy. The `2>/dev/null || true` means it also
swallows its own errors.

### Replacement

Remove it. In its place, a pre-flight check that **fails the deploy** on any failed migration:

```sql
SELECT version, description, installed_on FROM flyway_schema_history WHERE success = 0;
```

Non-empty ⇒ exit non-zero, print the rows, and stop before any container restarts. The failure
evidence stays in the table.

For genuine repair, a separate `repair-migration.yml`: manual dispatch only, environment approval,
requires the exact schema **and** version typed in, prints the target before acting, and records who
ran it and why. Repair becomes a deliberate, attributable act.

---

## 3. `reset-prod-db.yml` — disposition

Current state: `workflow_dispatch`, gated only on typing `RESET` in a text field, then
`DROP DATABASE` across every schema. Nothing prevents it targeting production; production is its
*only* target, since it reads the prod host from the deploy secrets.

**Recommendation: delete it.**

It cannot be made provably incapable of targeting production, because it has no notion of
environment — it uses the same `EC2_HOST` and `/app/.env` the production deploy uses. Making it safe
would mean rebuilding it as a different workflow against a different host, which is simply writing a
new file.

The disposable local stack already provides reset (`scripts/test-reset.sh`), with guards that refuse
any non-loopback target. That covers the legitimate use.

**If you want a reset capability retained**, I would write `reset-test-db.yml` that: accepts only an
allow-listed non-production host, rejects the production host by explicit comparison, requires
environment approval plus typed confirmation, and echoes the resolved target before acting. But that
is a new workflow, not a modification of this one.

---

## 4. Settlement — state model, constraints, idempotency

### State model

```
                    ┌──────────── reverse ────────────┐
                    ▼                                 │
DRAFT ──confirm──► FINALIZED ──────────────────► REVERSED (terminal, immutable)
                    │                                 │
                    │ (money moves via                │ supersedes
                    │  recordTransaction)             ▼
                    └──────────────────────► FINALIZED v(n+1)
```

- One **current finalized** settlement per `(tenant_id, chit_id, member_id)`
- Finalizing blocks normal financial activity for that member/chit
- Historical rows are **never updated or deleted** — corrections create a new version
- `REVERSED` records `reversed_by`, `reversed_at`, `reversal_reason`
- The replacement carries `version = n+1` and `supersedes_settlement_id`

### Schema

```sql
ALTER TABLE settlements
  ADD COLUMN version            INT NOT NULL DEFAULT 1,
  ADD COLUMN supersedes_settlement_id VARCHAR(36) NULL,
  ADD COLUMN reversed_by        VARCHAR(36) NULL,
  ADD COLUMN reversed_at        DATETIME    NULL,
  ADD COLUMN reversal_reason    TEXT        NULL,
  ADD COLUMN idempotency_key    VARCHAR(64) NULL,
  -- NULL when not current, so terminal rows never collide and MySQL's lack of
  -- partial indexes is worked around cleanly.
  ADD COLUMN current_key VARCHAR(160)
      GENERATED ALWAYS AS (
        CASE WHEN payment_status <> 'REVERSED'
             THEN CONCAT(tenant_id,':',chit_id,':',member_id) END) STORED,
  ADD UNIQUE KEY uk_settlement_current (current_key),
  ADD UNIQUE KEY uk_settlement_idem (idempotency_key);
```

The generated column is the final concurrency guarantee: two concurrent finalizations produce the
same `current_key` and one insert fails at the database, whatever the application does.

### Idempotency

| Case | Result |
|---|---|
| Same key, same payload | `200` with the original settlement |
| Same key, different payload | **`409 Conflict`** |
| No key, duplicate attempt | `409` from the unique constraint |

Requires a request-payload hash stored alongside the key to distinguish the two.

### Ordering

Constraint and lock **before** removing `BALANCED` from the terminal list, so the database defence
exists before behaviour changes.

### Tests
Sequential duplicate · concurrent duplicate (constraint must be what stops it) · retry same key ·
same key different payload ⇒ 409 · reverse-then-resettle produces v2 linked to v1 · original row
unchanged after reversal · all three outcomes: BALANCED, member-owes, org-owes.

---

## 5. Transactional outbox and consumer inbox

### Producer

```sql
CREATE TABLE outbox_event (
  id              VARCHAR(36)  PRIMARY KEY,
  tenant_id       VARCHAR(36)  NOT NULL,
  aggregate_type  VARCHAR(64)  NOT NULL,
  aggregate_id    VARCHAR(36)  NOT NULL,
  event_type      VARCHAR(64)  NOT NULL,
  payload         JSON         NOT NULL,
  created_at      DATETIME(3)  NOT NULL,
  published_at    DATETIME(3)  NULL,
  attempts        INT          NOT NULL DEFAULT 0,
  next_attempt_at DATETIME(3)  NOT NULL,
  last_error      TEXT         NULL,
  status          VARCHAR(16)  NOT NULL DEFAULT 'PENDING',  -- PENDING|PUBLISHED|DLQ
  KEY idx_outbox_claim (status, next_attempt_at)
);
```

Written **in the same transaction** as the business change. Replaces `publishAfterCommit`, which
publishes after the transaction and drops failures.

### Publisher

Scheduled worker:

```sql
SELECT * FROM outbox_event
 WHERE status='PENDING' AND next_attempt_at <= NOW(3)
 ORDER BY created_at LIMIT 100
 FOR UPDATE SKIP LOCKED;
```

`SKIP LOCKED` (MySQL 8) is what prevents two workers claiming the same row. `published_at` and
`status='PUBLISHED'` are set **only after the broker confirms**. On failure: increment `attempts`,
record `last_error`, set `next_attempt_at` by bounded exponential backoff; after N attempts set
`status='DLQ'` and alert.

### Consumer inbox

```sql
CREATE TABLE processed_event (
  event_id     VARCHAR(36) PRIMARY KEY,
  consumer     VARCHAR(64) NOT NULL,
  processed_at DATETIME(3) NOT NULL
);
```

Written in the **same transaction as the side effect**. A duplicate delivery hits the primary key
and no-ops — so a repeated event cannot double-post a treasury entry, a report row or a notification.

### Claim

**Not exactly-once transport.** At-least-once delivery plus idempotent consumers, giving
**effectively-once financial side effects**. That is the claim I will make and test.

### Tests
Rollback leaves no outbox row · publisher failure leaves it PENDING and retried · broker timeout ·
duplicate delivery ⇒ one side effect · out-of-order delivery · consumer restart mid-batch · app
restart between commit and publish · DLQ after exhausted attempts · two workers cannot claim the
same row · reconciliation query finds outbox rows with no matching `processed_event`.

---

## 6. Money-field inventory and paise convergence

### Inventory

| Representation | Count |
|---|---|
| `BigDecimal` fields across services | **233** |
| Columns with explicit precision | **65** |
| — `DECIMAL(15,2)` | 59 |
| — `DECIMAL(10,2)` | 3 |
| — `DECIMAL(12,2)` | 1 |
| — `DECIMAL(5,2)` | 2 |
| Files already using integer `*Paise` | **11** (billing/plans only) |

**Correction — the `DECIMAL(5,2)` columns are not a defect.** I flagged them as a possible live bug
before checking what they hold. Both are percentages, not amounts:

- `Promotion.discountPct`
- `PlanLimits.globalDiscountPct`

A cap of 999.99 is correct for a percentage. Withdrawn.

**Real finding — money scale is inconsistent.** Four money columns are narrower than the rest:

| Column | Precision | Max |
|---|---|---|
| `TenantDiscount.discountValue` | `DECIMAL(10,2)` | ₹99,999,999.99 |
| `Promotion.referrerCreditInr` | `DECIMAL(10,2)` | ₹99,999,999.99 |
| `ReferralCredit.creditInr` | `DECIMAL(10,2)` | ₹99,999,999.99 |
| `Tenant.creditBalanceInr` | `DECIMAL(12,2)` | ₹9,999,999,999.99 |
| all others (59) | `DECIMAL(15,2)` | ₹9,999,999,999,999.99 |

Not urgent — a single ₹100M credit is not a realistic value — but "money is `DECIMAL(15,2)`
everywhere" is not currently true, and this is precisely the drift the convergence removes.

### Confirming your decision

You chose integer paise; I had recommended `BigDecimal(19,2)`. Building to your decision — but the
cost is worth stating once, plainly:

- **233 fields** move to `long`, against 11 already on paise
- **Every formula** in `AuctionService`, `PaymentService`, `SettlementService`, `PayoutService`
  changes, along with the FIFO allocator and every rounding site
- **The oracle and all 158 tests** re-express expected values in paise
- **Every API contract** carrying money changes shape, so web and mobile change together

It is the more defensible long-term representation — no accidental float, no scale drift, exact
allocation. I am not arguing against it. But it is a multi-week refactor touching every money path,
and it should be scheduled as such rather than folded into a test-hardening effort.

**A middle option**, if you want the guarantee sooner at lower risk: standardise every money column
on `DECIMAL(19,2)` now (removing the 5,2/10,2/12,2 drift, which is a real defect), and converge to
paise as a separate planned migration. Your call — I will build whichever you confirm.

### Convergence plan (if paise confirmed)

1. **Inventory** — every field, column, DTO, API contract and UI display site, with its current type
2. **Conversion map** — `paise = rupees × 100`, exact; reject any value with sub-paise precision
3. **Expand/contract migration** — add `*_paise BIGINT` beside each decimal column; dual-write; backfill
   with verification query; dual-read with mismatch alarm; cut over; drop the decimal column
4. **API compatibility** — serve both fields during transition, `amount` and `amountPaise`; deprecate
   the former on a stated date
5. **Rounding** — `BigDecimal` internally for percentages and division with explicit
   `MathContext`, converted to paise once at the posting boundary; remainders allocated
   deterministically (largest-remainder, as already implemented for dividends)
6. **Overflow** — `long` gives ±9.2×10¹⁸ paise; document the cap and validate against JavaScript's
   safe-integer limit (2⁵³) in web and mobile, since JSON numbers beyond that lose precision.
   **Serialize money as a string** to avoid it entirely
7. **Reconciliation queries** — per table, assert `paise = ROUND(decimal × 100)` for every row
8. **Rollback** — the decimal column survives until the final contract step, so rollback is a config flip
9. **Test updates** — oracle first, then unit, then integration

**Not started. Awaiting your confirmation of representation.**

---

## 7. CI workflow plan

### A — every pull request (~4–6 min)
compile · lint/type-check · unit · repository · **oracle** · service-integration
Runner: `ubuntu-latest`. No Docker stack.

### B — relevant PRs and every merge to main (~12–18 min)
Docker stack (MySQL, Redis, gateway, all services) · **Flyway from empty** · real-stack API E2E
through the gateway · Playwright · logs and artifacts retained on failure.

### C — nightly (~35–50 min)
Full lifecycle for all three chit types · concurrency and idempotency · failure/retry · extended
regression · mobile automation where supported.

### Path filters

Filters only skip clearly unrelated work. **Full suite always runs** for changes under:
`chitfund-common`, any `db/migration`, `chitfund-api-gateway`, auth, payment, chit, payout,
settlement, reporting, treasury, or `.github/workflows` and deploy files.

Docs-only and mobile-only-UI changes may skip B.

---

## 8. Revised test taxonomy

| Level | Now | Definition |
|---|---|---|
| Unit | 85 | Single class, collaborators mocked |
| Repository | 0 | Real DB, repository layer only — **none exist** |
| Oracle | ~50 | Independent reference model, no application code |
| Service integration | 73 | Real DB, real service, **no gateway, subset of services** |
| Real-stack API E2E | **0** | All services + gateway, requests as a client makes them |
| Browser E2E | **0** | Playwright against the real UI |
| Mobile E2E | 11 | Maestro, coordinate-based, **no value assertions** |

The 73 will be reported as **service integration**, not E2E, per your direction. Headline count
stays 158 with the composition stated, not rounded up.

---

## 9. Release-blocking acceptance criteria

1. **Migration integrity** — no migration whose version appears in production history differs from
   its committed original; CI checksum guard active
2. **No history deletion** — the DELETE removed; a failed migration stops the deploy with evidence
   retained; repair only via attended workflow
3. **No production reset capability** — `reset-prod-db.yml` deleted or provably non-production
4. **Settlement uniqueness** — duplicates impossible sequentially and concurrently, enforced by
   database constraint; reversal produces a linked new version; originals immutable
5. **Event delivery** — every financial event delivered or visible in DLQ; duplicate delivery
   produces exactly one side effect; reconciliation query returns empty
6. **Full lifecycle** — all three chit types complete end to end with every reconciliation matching
   the oracle **to the paisa**
7. **UI truth** — web and mobile assert exact financial values against the same oracle
8. **CI proven** — demonstrated red on a failing test; deployed image digest matches built digest
9. **Traceability** — no uncovered cell; levels reported separately; no mocked test described as E2E
10. **Stability** — full suite green twice consecutively

---

## What I need from you

1. **Run the read-only query in §1.2** — the audit cannot be completed without it
2. **Confirm money representation** — paise as decided, or the `DECIMAL(19,2)` interim (§6)
3. **Confirm `reset-prod-db.yml` deletion** (§3)

Analysis and isolated tests continue meanwhile. No migration or money work starts without approval.
