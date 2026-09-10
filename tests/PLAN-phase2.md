# ChitWise — Plan: Verification, Reliability and True End-to-End Coverage

## Context

158 tests now exist (85 Java, 73 cross-service/oracle) and 22 defects are fixed. That is not the
complete end-to-end validation originally asked for. Three gaps remain:

1. **No UI value assertions.** Web has no test tooling; mobile has coordinate-based smoke flows. A
   figure can be wrong on screen while every backend test passes — which is exactly the class of
   bug found this session (inflated collections total, silently empty lists).
2. **Two confirmed defects are unfixed** — duplicate settlements (R5) and no event outbox (R2).
3. **The current fixes are self-attested.** They were verified by the same person who wrote them.

This plan closes all three. It also corrects one thing in the request: Phase 1 item 7 asks me to
verify no migration was edited after being applied to production. **Two were** — deliberately, by me
(see §1.7). That is a decision to ratify, not a check to run.

---

## Phase 1 — Independently verify the current fixes

Everything here is evidence-producing. Nothing is taken on trust, including my own claims.

### 1.1 Empty database runs every migration

Fresh MySQL, all nine schemas, all services. Assert `flyway_schema_history` has zero `success = 0`
rows and the expected version count per service. **Evidence:** captured migration history per schema.

Currently only five schemas are exercised (the money services). This extends to notification, audit,
reporting and management, none of which have ever been built from empty in this session.

### 1.2 Production-state database upgrades cleanly

The important one, and not yet done. Build a database at production's *current* migration state,
then apply the code's migrations.

- Dump prod's `flyway_schema_history` (version, checksum, success) — **schema metadata only, no
  business data**
- Replay into the test stack, then start services and let Flyway upgrade
- Assert: no failures, **no history rows deleted**, and checksum mismatches surface rather than pass
  silently

This directly tests whether my `V10`/`V26` edits are as inert in prod as I claimed. If prod's stored
checksums differ from the edited files, `validate-on-migrate: false` currently hides it — which is
its own finding.

### 1.3 All services start after migration

Health endpoint per service plus one real request each, not just container health. A service can be
"healthy" and still fail its first query.

### 1.4 CI executes tests and fails on failure

Prove by demonstration: push a branch with a deliberately failing assertion, confirm the pipeline
goes red and blocks the deploy, then revert. **Evidence:** run URL, red then green.

CI currently runs `mvn test` and prints `Tests run: N` — but nobody has ever seen it *fail*.

### 1.5 Docker images genuinely built and pushed

Compare the image digest in GHCR against the digest running on EC2 after deploy, and check the
image's creation timestamp against the commit. A green "Build & Push" step is not evidence the
running container changed.

### 1.6 Regression test per defect

Map all 22 fixes to a covering test. **Expected outcome: gaps.** Several fixes — the four wrong API
paths, the mobile UI bugs, `toast.error` — have no automated coverage. Deliver a table of
defect → test → status, and write what is missing.

### 1.7 Migrations edited after production — a decision, not a check

`V10__add_tenant_id_to_chit_month_draws.sql` and `V26__add_tenant_id_to_payment_tables.sql` were
edited in `36fc250`, after both were applied in production.

- **Why:** payment-service could not build a fresh database. Both added `tenant_id` to
  `chit_month_draws`, and `V10`'s backfill read a column `V26` creates.
- **Why it was survivable:** both are already recorded as applied in prod, and
  `validate-on-migrate: false` means changed checksums do not trigger a re-run.
- **The alternative** would have been new forward-only migrations (`V36`, `V37`) leaving the broken
  originals in place — which keeps history immutable but leaves two migrations that fail on any
  fresh database.

**Decision required:** ratify the edit, or revert and replace with forward-only migrations. I
recommend ratifying and adding a CI check that fails if an applied migration's checksum changes
again, so this is a one-off rather than a precedent.

### 1.8 Stop deleting Flyway history

`deploy.yml:532` runs, on every deploy:

```sql
DELETE FROM flyway_schema_history WHERE success = 0;
```

This is why the schema fault stayed invisible for months: each deploy erased the evidence and
retried, so a permanently broken migration looked like a transient failure.

**Replacement:**
- Remove the DELETE
- On failed migration, fail the deploy loudly with the failing version and error
- Add a `workflow_dispatch` repair job that requires naming the exact version to clear, logs who and
  why, and refuses to run unattended

**Also found:** `.github/workflows/reset-prod-db.yml` drops every production database, gated only on
typing `RESET` in a form field. Worth reviewing whether it should exist at all, or require an
environment approval.

**Deliverable:** verification report with evidence per item; defect→test matrix; PR removing the
DELETE.

---

## Phase 2 — Duplicate settlement protection

**Confirmed defect.** A member can hold two settlement rows, sequentially and concurrently. The
guard at `SettlementService.java:156-163` treats `BALANCED` as terminal, so a completed settlement
does not block a new one; concurrently there is also an unlocked read-then-write.

Money impact is **not yet demonstrated** — every scenario reachable so far computes net zero.
Phase 5's full lifecycle will settle that, and it should be answered before choosing how far to go.

### Product rule to implement

One active settlement per (tenant, member). Not per chit — a settlement spans all of a member's
chits, so a chit-level key would permit exactly the duplication being prevented.

### Design

1. **Database constraint as the final defence.** MySQL has no partial unique index, so add a
   generated column that is the member id when the settlement is live and `NULL` when terminal, and
   put a unique index on it. NULLs do not collide, so terminal settlements never block a legitimate
   later one.
2. **Pessimistic lock** around check-and-insert, closing the race before it reaches the constraint.
3. **Idempotency key** on confirm: same key returns the original settlement; same key with a
   different payload returns `409`.
4. **Corrections via reversal**, never a second insert — void the settlement, then create a new one.
   The existing `voidSettlement` already reverts records and treasury.

### If legitimate re-settlement is needed

Do not widen the constraint. Add `settlement_version` and a `supersedes_settlement_id`, so a second
settlement is explicitly a new version of a closed one with an audit link. Propose the state machine
before implementing.

### Tests
Sequential duplicate · concurrent duplicate · retry with same key · same key different payload ·
void-then-resettle · all three outcomes (BALANCED, member-owes, org-owes) · constraint violation
surfaces as `409` not `500`.

---

## Phase 3 — Transactional outbox and consumer idempotency

**Confirmed gap.** `publishAfterCommit` is fire-and-forget. A publish failure after commit is logged
and dropped; reporting and notification then diverge from the ledger with nothing to detect or
repair it.

### Design

**Producer.** `outbox_event` table written in the *same transaction* as the business change:
`id, aggregate_type, aggregate_id, event_type, payload, tenant_id, created_at, published_at,
attempts, last_error, next_attempt_at`.

**Publisher.** Scheduled worker claiming rows with `SELECT ... FOR UPDATE SKIP LOCKED` — that is
what stops two workers publishing the same row, and it is available in MySQL 8. Mark
`published_at` only after the broker confirms. Bounded exponential backoff; after N attempts move to
DLQ status and alert.

**Consumer.** `processed_event` table keyed on event id, written in the same transaction as the side
effect. A duplicate delivery finds the row and no-ops.

I will **not** claim exactly-once transport. The claim is effectively-once *side effects*: at-least-
once delivery plus idempotent consumers.

### Tests
Rollback leaves no outbox row · publisher failure leaves the row unpublished and retried ·
queue timeout · duplicate delivery produces one side effect · out-of-order delivery · consumer
restart mid-batch · application restart between commit and publish · DLQ after exhausted retries ·
two workers cannot claim the same row.

---

## Phase 4 — Money representation (design only, no implementation)

### Inventory (preliminary)

- **233** `BigDecimal` fields across services
- **65** columns with explicit precision, in **four** variants: `15,2` (59), `10,2` (3), `12,2` (1),
  `5,2` (2)
- **11** files using integer `*Paise` fields — billing and plan payments only

**Finding to confirm:** `precision = 5, scale = 2` caps a value at **999.99**. If any of those hold
money, amounts above ₹999.99 fail on insert. Needs checking before anything else in this phase.

### Recommendation

**Converge on `BigDecimal` at `DECIMAL(19,2)`**, and migrate the 11 paise files to match.

Rationale: 233 fields already use it against 11 that do not; chit amounts are the core domain while
paise is confined to plan billing; and the oracle, all 158 tests and every calculation already
assume 2dp `BigDecimal`. Moving the majority to minor units would rewrite every formula and every
expected value for no domain benefit.

The plan must cover: rounding policy per operation · currency scale · JSON serialization (string,
not float) · frontend and mobile display · migration with expand/contract · backward-compatible API
contracts during rollout · overflow limits · oracle updates · rollback.

**No implementation until the representation is approved.**

---

## Phase 5 — True API end-to-end testing

Real stack, real service boundaries, real MySQL. Extends the existing `docker-compose.test.yml` to
all nine services plus the gateway, so calls traverse the gateway exactly as production does.

All three chit types — RESERVATION, LOTTERY, AUCTION — through the full lifecycle: create,
configure, invite, enrol (including multi-spot), activate, open each cycle, draw or auction, collect
via manager and staff across every payment mode, record early/advance/partial/late/missed/over
payments, compute discount, dividend and commission, create payouts, disburse partially then fully,
void and reverse, settle members, close, and reconcile reports.

The 19 personas from the original plan drive member behaviour.

**Expected values come from `tests/oracle/chitmath.py`, never from application responses.** After
every scenario, reconcile: member ledger, obligations, collections, discounts, dividends,
commission, credits, refunds, payouts, settlement, treasury, reports.

This is also where Phase 2's open question gets answered — whether duplicate settlements can carry
real money.

---

## Phase 6 — Web UI testing

Add Playwright (no test tooling exists in the frontend today).

Every role × all three chit types. **Assert exact rendered values**, not that pages load: the
collections total, a member's outstanding, dividend per member, payout net, settlement figure — each
compared against the oracle.

Covers manager and staff collection flows, partial/advance/late/missed payments, auction and draw
workflows, treasury, payouts and voiding, settlement, reports, validation messages, unauthorized
operations through the UI, session expiry, direct URL navigation and refresh, duplicate submission,
and responsive layouts.

Requires stable `data-testid` attributes; the audit of what needs adding is part of this phase.

---

## Phase 7 — Mobile testing

Replace coordinate taps — `09_admin_finance.yaml` taps `"70%,94%"` and asserts the word "Finance"
appears, which is why the mobile bugs found this session went unnoticed.

Add `testID` props to every element under test, then validate login and session handling, member
balances, payment history, partial-payment status, advance and overdue values, draw and auction
info, payout and settlement values, notifications, offline/retry, and **consistency between mobile,
web and backend for the same member** — the same figure fetched three ways must agree.

---

## Phase 8 — Traceability and release report

Matrix over: 3 chit types × every formula × 19 personas × 6 roles × 5 payment modes × 17 lifecycle
stages × positive/negative/void/concurrency/idempotency/migration/failure × API/web/mobile.

Per test: stable ID, scenario, expected formula, level, automated or manual, command, evidence,
linked requirement, linked defect, result.

**Levels reported separately and not conflated:** unit · repository · calculation-oracle · service
integration · real-stack API E2E · browser E2E · mobile.

The current 73 "cross-service" tests are real-stack against five services without the gateway. They
will be reported as such, not as full-stack E2E.

---

## Execution order

1 → 2 → 3 → 5 → 6 → 7 → 8, with 4 as design-only in parallel.

Phase 1 first because the other phases build on fixes that are currently self-attested. Phase 2 and
3 before 5 so the E2E suite tests the intended behaviour rather than encoding known defects. Phase 4
stays design-only until the representation is chosen — starting it late avoids rewriting the oracle
mid-flight. UI last: most expensive, least likely to find calculation bugs.

## Effort

| Phase | Estimate |
|---|---|
| 1 verification | 2–3 days |
| 2 settlement | 2–3 days |
| 3 outbox | 4–6 days |
| 4 money design | 2 days (design only) |
| 5 API E2E | 5–8 days |
| 6 web UI | 5–8 days |
| 7 mobile | 3–5 days |
| 8 traceability | 2–3 days |

**Total ≈ 25–38 working days.** Phases 5 and 6 dominate and are the most likely to overrun, because
both depend on fixtures that do not exist yet.

## Risks and required decisions

**Decisions needed before starting:**
1. Ratify or revert the two edited migrations (§1.7)
2. Approve removing the Flyway-history DELETE, and whether `reset-prod-db.yml` should exist
3. Is re-settlement after new activity a real requirement? Determines Phase 2's shape
4. Money representation — `BigDecimal(19,2)` recommended
5. Where does the E2E suite run in CI? It needs Docker and several minutes

**Risks:**
- Phase 3 changes how every service publishes events — the largest blast radius here
- Phase 6 needs `data-testid` across the frontend; without it tests will be brittle
- No staging environment, so Phases 1.2 and 1.5 need a production-shaped stack built locally
- Python deps are installed via `pip --user`; needs a virtualenv or lockfile before CI

## Release-blocking issues

1. **Duplicate settlements** (Phase 2) — confirmed defect in money code
2. **No outbox** (Phase 3) — financial events can be silently lost
3. **Flyway history deletion** (Phase 1.8) — hides migration failures in production
4. **No UI value assertions** (Phases 6–7) — the class of bug found most often this session

Not blocking: money representation (works today, just inconsistent), WhatsApp recipient handling
(feature-flagged off), Java 18/21 divergence.

## Acceptance criteria

- Empty database and production-state database both migrate with zero failures and **zero deleted
  history rows**
- CI demonstrably fails on a failing test — evidenced by a red run
- Deployed image digest matches the built digest
- Every one of the 22 defects has a named regression test, or is explicitly listed as uncovered
- Duplicate settlement impossible sequentially and concurrently, enforced by a database constraint
- Every financial event either delivered or visible in the DLQ; duplicate delivery produces one side
  effect
- All three chit types complete a full lifecycle with every reconciliation matching the independent
  oracle to the paisa
- Web and mobile assert exact financial values matching the same oracle
- Traceability matrix has no uncovered cell, with levels reported separately
- Full suite green twice consecutively
