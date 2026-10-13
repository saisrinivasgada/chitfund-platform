# ChitWise Product Audit, Remediation, and Regression Report

## Executive decision

**Decision: conditional no-go for an unmonitored public launch.**

The tested backend, financial, identity, entitlement, audit, event-delivery, web-build, and mobile-bundle paths are green. The audit found and repaired multiple release-blocking defects, including duplicate settlement money movement, non-atomic payout effects, cross-tenant access paths, fail-open entitlement checks, and durable-event timestamps that could delay every outbox message by the host timezone offset.

The product should not yet be described as completely production-certified because physical-device workflows, real provider delivery, Android rendered-client E2E, and a complete gateway-driven browser suite were not completed in this environment. Deterministic Playwright coverage now renders and asserts the organization audit timeline, capability locks, exact payment/allocation values, offline sync time, and full-void behavior. A separate rendered Chromium journey creates a member through the real gateway and member service against disposable MySQL 8, renders the returned server value, deletes it through the gateway, and verifies cleanup. A real release iOS build was exercised through the gateway on an iOS 26.5 simulator, including authentication, six-box OTP, navigation, session restoration, logout, and a real offline payment/reconnect cycle. The mobile dependency scanner also reports high-severity advisories in Expo's Node-side build/signing toolchain for which Expo 54 has no compatible patched dependency path. The shipped iOS/Android bundles build successfully, and the vulnerable packages are not application business-code paths. CI now permits only those two exact advisories at exact package versions, fails for every other High/Critical finding, and expires the exception on 2027-01-31.

There are **no unresolved Critical or High application defects in the workflows changed and exercised by the automated suites**. The remaining scanner and validation gaps are listed explicitly below.

## Scope and Git evidence

- Audit starting commit: `20243d89ce005a2801a14a216973fccf80f30809`
- Code-under-test commit after the latest remediation: `55b0d5f`
- Mobile verification-harness commit: `892de44`
- Working branch: `codex/full-product-audit`
- Shared integration branch inspected and fully integrated: `origin/test` at `d344892`
- Production, `main`, and production data were not changed.
- No force push or production deployment was performed.
- Previously applied Flyway files were not edited; schema work used additive migrations.
- Management migration V9 remains absent and did not execute. It was intentionally not reintroduced.

The earlier `origin/test` bookkeeping commits rename Claude's new payment table migration to V46 and add checksums. They are merged into the audit branch's ancestry, but the conflict was deliberately resolved as V51 because this branch already has an existing V46. MySQL 8 applied and validated all 51 payment migrations, and the migration safety manifest contains exactly one entry for the new table.

The final shared-branch synchronization also integrated the actor name/role and chit-name enrichment for payment intimations plus the `shell-quote` dependency patch. The merge preserves the audit branch's tenant locking, idempotency, multi-chit allocation, payment-mode/reference, and complete-void behavior. A new regression verifies that response enrichment is tenant-scoped and tolerates missing display names instead of failing a successful financial response.

## Product inventory

| Area | Responsibility reviewed |
| --- | --- |
| API Gateway | JWT propagation, internal-header stripping, request context, tenant and capability enforcement |
| User Service | Authentication, sessions, tenants, plans, billing, capabilities, account recovery, cross-organization identity |
| Member Service | Tenant member profiles, staff/admin member operations, app access, member relationships |
| Chit Service | Chits, enrollment, invitations, reservations, lotteries, auctions, draws, winners, lifecycle |
| Payment Service | Payment records/batches/allocations, multi-chit allocation, credits, treasury, cash requests, settlements, intimations |
| Payout Service | Payout creation, deductions, disbursement, reversal, idempotency |
| Notification Service | In-app, push/email adapters, recipient scoping, delivery outbox, WebSocket updates |
| Audit Service | Append-only operational/security history, tenant queries, correlation and filtering |
| Reporting Service | Event-driven reporting projections and inbox deduplication |
| Management Service | Hub employees, roles, tickets, chat, identity cases, protected owner approval |
| Web Client | Organization UI, member UI, Hub, Super Admin, capability gates, activity views |
| ChitWise Mobile | Admin, manager, staff, member, offline synchronization, tenant switching, tutorials |
| ChitWise Hub Mobile | Hub authentication and shared Hub workflows using the same APIs |
| Operations | CI/CD, Secrets Manager retrieval, metrics, outbox alerts, replay runbooks, migration checksums |

## Plan and capability inventory

Current plan catalogue discovered from migrations and service models:

- `BASIC`: free entry plan
- `GROWTH`
- `ENTERPRISE`
- `CUSTOM`: organization-specific overrides

Current capability catalogue:

- `priority_support`
- `full_analytics`
- `live_chat`
- `settlement`

Enforced quantitative/configurable limits include active chits, members, staff, allowed chit types, plan expiry, and tenant custom overrides. The supported winner-selection modes are Reservation, Lottery, and Auction; auctions support online and offline modes.

The server is authoritative. Missing, malformed, expired, or stale entitlement information now fails closed. Direct API, stale-session, internal-service, and UI-gate bypass paths were reviewed and repaired. Limit mutations use database serialization so two concurrent requests cannot both cross an exact plan limit.

## Important defects fixed

### Critical financial correctness

1. **Duplicate settlement could refund the same paid amount repeatedly.**
   - Business impact: a member who paid ₹8,000 could be refunded ₹8,000 more than once.
   - Root cause: finished settlements were treated as non-blocking; the existence check also lost concurrent races.
   - Repair: one live settlement is enforced by MySQL, sequential/concurrent confirms are idempotent/conflict-safe, and supersession reverses and replaces the prior version rather than recomputing from zero.

2. **Settlement supersession could mishandle partial money and consumed credit.**
   - Repair: immutable settlement versions, linked reversal/replacement transactions, locked credit reads, restoration/carry-forward rules, and concurrent supersession tests.

3. **Payout and draw side effects could separate across service failures.**
   - Repair: idempotent financial commands, durable command/outbox processing, winner verification, append-only reversals, and failure-safe completion synchronization.

4. **Financial mutations had duplicate-submission and allocation races.**
   - Repair: tenant-scoped idempotency fingerprints, row locking, database uniqueness, safe HTTP 400/409 mapping, and MySQL concurrency tests.

### High security and isolation

1. Tenant-unscoped member, chit, payment, payout, notification, ticket, and realtime lookups were removed or made fail-closed.
2. Gateway forwarding of spoofable internal credentials was blocked.
3. Plan/capability decisions are enforced server-side and refreshed after entitlement changes.
4. Hub ticket, chat, employee, identity-case, and socket permissions default to deny.
5. Authentication responses avoid account enumeration, stale sessions are revoked, and rejected security controls are audited without credentials or OTP contents.
6. Cross-organization member linking requires proof; matching a phone number alone never grants access.
7. Recycled-phone execution is owner-approved, idempotent, session-revoking, and preserves old financial history on the old identity.

### High audit and event reliability

1. Audit/notification events previously could publish before commit, after rollback, or disappear into a warning log.
2. Core audit evidence and domain events are now inserted transactionally with business state and relayed through durable outboxes.
3. Consumer inboxes deduplicate at-least-once delivery using stable logical event IDs.
4. Replay is authenticated and audited; failed rows have metrics, alerts, retention rules, and runbooks.
5. A newly reproduced timezone defect stored outbox `next_attempt_at` seven hours in the future when the JVM ran in Pacific time. All affected outboxes now use `Instant`/UTC-safe JDBC conversion.

### Web dependency security

- Axios was updated from 1.18 to 1.20.
- `source-map-js` is pinned to 1.2.2.
- Web `npm audit --audit-level=high` now reports zero vulnerabilities.

### Rendered UI correctness

- Playwright browser assertions now run in frontend CI for audit filters, direct-URL capability locks, payment values, allocations, offline sync timestamps, and reasoned full voids.
- The disposable MySQL 8 CI job now also runs a rendered browser member journey through the real gateway. The synthetic browser identity mocks only three user-row-bound session/limit reads because a clean schema deliberately has no seeded organization admin; create, list, render, delete, authorization and database cleanup remain real.
- The first rendered receipt run exposed a real date-only timezone defect: a `2026-01-01` chit start date appeared as `31 Dec 2025` in Pacific time. Web receipt formatting and the shared mobile date formatter now preserve calendar dates without timezone shifting.
- The browser runner uses a dedicated strict port and refuses to reuse an existing development server, preventing a developer's stale main checkout from being mistaken for the branch under test.

## Audit coverage matrix

Legend: **Automated** means assertions exist in Java or disposable service-integration tests. **Code-reviewed** means the mutation/audit path was inspected and repaired but does not have a complete user-facing E2E journey here. **Manual pending** means physical UI/provider confirmation is still required.

| Domain | Evidence status | Important behavior covered |
| --- | --- | --- |
| Financial ledger | Automated | payment allocation, treasury, credits, payout, disbursement, settlement, reversal invariants |
| Organization activity | Automated + code-reviewed | append-only events, tenant filtering, correlation, deep-link metadata, Activity Center queries |
| Security audit | Automated + code-reviewed | login outcomes, denied access, plan/role/account controls, identity approval |
| Delivery history | Automated | outbox/inbox identity, retry, replay, failure metrics, retention, concurrent claims |
| Chit lifecycle | Automated + code-reviewed | create/activate/complete, tenant checks, post-commit audit/event publication |
| Draws and winners | Automated + code-reviewed | deletion blocked when destructive, winner verification, committed events |
| Auction | Automated | close calculations, concurrency, dividend idempotency, tenant validation |
| Lottery/reservation | Automated + code-reviewed | strategy selection, reservation conflicts, tenant isolation |
| Members and enrollment | Automated + code-reviewed | tenant relationships, lifecycle audit, plan limits, identity ownership |
| Chit Invitations | Automated + code-reviewed | kept separate from Chitfund Requests and tenant-scoped |
| Chitfund Requests | Automated | first-time/existing account proof, resend, decline, revoke, expiry, multi-org link |
| Payments | Automated | idempotency, over-allocation protection, void, failure resilience, treasury reconciliation |
| Offline payments/sync | Automated + iOS simulator verified | local queue, restart persistence, automatic reconnect, original occurrence/sync timestamps, idempotency, history and treasury |
| Cash pickup/custody | Automated + code-reviewed | tenant controls and transaction boundaries; full staff-device journey pending |
| Payout/disbursement | Automated | creation, limits, duplicate prevention, deduction, void/reversal, append-only history |
| Settlement | Automated | duplicate protection, concurrency, partial/full collection, credit, supersession chains |
| Tickets/chat | Automated + code-reviewed | permissions, required reasons, post-commit messages, reopen/assignment history |
| Plans/capabilities/billing | Automated | fail-closed gates, custom limits, exact-limit concurrency, idempotent billing/refunds |
| Super Admin/Hub | Automated + code-reviewed | employee permissions, platform capability, tenant controls, identity-case owner approval |
| Web UI values | Rendered Playwright + gateway journey + build/lint | audit filters, capability lock states, payment/allocation values, sync timestamp, void state, and real member create/list/delete; remaining financial/Hub gateway journeys pending |
| Mobile UI values | Automated iOS simulator + type-check/bundle | admin login/OTP, navigation, session/logout and offline payment values; physical iOS and rendered Android remain pending |

## Functional and security verification

The automated suites cover:

- Unauthenticated, expired-token, wrong-signature, wrong-role, IDOR/BOLA, cross-tenant, and internal-key refusal.
- One global member joining organizations A and B while tenant profiles remain separate.
- Mandatory verified email for admin/staff login and protected account-access flows.
- Sequential and concurrent idempotency for payments, payouts, billing, limits, and settlements.
- Single-chit/multi-record allocation invariants and prevention of overpayment/over-disbursement.
- Payout creation, deduction, disbursement guards, void, and append-only reversal.
- Settlement double-click, concurrent confirms, partial collection, full collection/disbursement, credit restoration, supersession, and reversal reconciliation.
- Outbox claim leasing, stale-worker protection, retention, failed-delivery visibility, replay, SQS duplicate delivery, and inbox deduplication.
- Read-only operational metrics authentication.
- Recycled-phone investigation, protected-owner approval, retry safety, session revocation, and immutable old history.
- Release-iOS simulator journeys through the real gateway for admin login/OTP, dashboard, members, chits, entitled messaging, finance, persisted session, and logout/account-vault behavior.
- Offline UPI capture while payment-service was unavailable, queue survival across app restart, automatic reconnect, durable synced status, and a single matching history row.
- Payment-intimation actor role/name and chit-name enrichment without cross-tenant role leakage, while retaining payment mode/reference and safe missing-name fallback.
- Rendered Chromium member creation, listing and deletion through the real gateway and member service against disposable MySQL 8; unauthenticated gateway access returned 401 and no active test member remained after cleanup.

Security review also covered enumeration, refresh/session revocation, internal service authentication, tenant scoping, role escalation, capability bypass, sensitive logs, CSP, and AWS Secrets Manager usage. No credentials, tokens, full OTPs, or production personal information were added to Git by this audit.

## Financial invariants verified on disposable MySQL 8

- Allocations never exceed their payment batch.
- Payment records are not paid above amount due.
- Money columns do not become negative where prohibited.
- Voided batches retain no live allocations.
- Treasury remains reconciled with completed collections.
- Disbursed amount never exceeds approved payout.
- A member has at most one live settlement per tenant.
- Duplicate and concurrent settlement commands cannot move money twice.
- Supersession reverses prior money and credit before replacement.
- Admin-wallet decimal and paise shadow values agree exactly.
- Migration V37/V38 generated-column uniqueness works in real MySQL 8, not only H2.
- The simulator-recorded offline UPI scenario produced exactly one ₹3,500 batch, one ₹3,500 allocation, and one ₹3,500 bank-treasury credit. A ₹7,000 record became `PARTIALLY_PAID` at ₹3,500, and device occurrence time preceded server sync time by 87 seconds.
- The same offline batch retained one idempotency key and one 64-character request fingerprint; no duplicate history row was rendered.

## Test evidence

| Verification | Result |
| --- | --- |
| Maven reactor | 626 tests, 0 failures, 0 errors across all 12 modules |
| Payment service | 175 tests green, including MySQL migration/concurrency and tenant-scoped intimation enrichment |
| Payout service | 83 tests green |
| Disposable MySQL 8 service integration | 112 passed, 1 optional event-overlay test skipped |
| Real SQS event overlay (MySQL 8 + LocalStack) | 2 passed; legacy/outbox duplicate delivery deduplicated |
| Protected identity/Hub overlay | owner-approved phone reassignment passed |
| Web lint | passed |
| Web production build | passed |
| Web dependency audit | 0 vulnerabilities |
| Rendered Playwright web suite | 3/3 passed in Chromium; also passed with CI worker/retry configuration |
| Rendered gateway browser journey | 1/1 passed: member create/list/delete through gateway + member service + MySQL 8; cleanup count 0; unauthenticated request 401 |
| Mobile TypeScript | passed |
| Expo Doctor | 18/18 checks passed |
| Ordinary ChitWise bundle | iOS and Android production bundles passed |
| ChitWise Hub bundle | iOS and Android production bundles passed |
| Mobile dependency policy | 4/4 fail-closed policy tests passed; 0 Critical; `shell-quote` resolved to patched 1.12.0; only two pinned Expo build-tool exceptions accepted |
| Release iOS simulator admin suite | 8/8 stateful Maestro flows passed serially through the gateway |
| Release iOS simulator offline payment | 3/3 phases passed: queue, restart persistence, reconnect/history; MySQL reconciliation exact |
| Migration safety/checksum script | passed, including payment V51 |

One clean-stack run had a single first-request timeout while six Spring services were cold-starting inside a 4 GB Docker VM. The same focused wallet test passed in 1.5 seconds after warm-up, followed by a complete warm run of 112/112. This is recorded as test-host resource contention, not hidden as an application pass.

The offline simulator stack deliberately omitted LocalStack while reconnecting the payment. Its three destination deliveries became visible `FAILED` outbox rows after three attempts rather than disappearing. The separate MySQL 8 + LocalStack overlay above passed both delivery/deduplication cases; no real production queue or provider was contacted.

## Remaining limitations and required release work

1. **Mobile dependency exception.** `npm audit` currently reports high advisories through Expo 54's Node-side Metro globbing and code-signing tooling (`braces` and `node-forge`). Current patched dependency paths require a major Expo/React Native change. Do not use `npm audit fix --force`. CI accepts only the exact reviewed advisory URLs and installed versions, fails on unknown High/Critical findings, and expires the exception on 2027-01-31. Complete an Expo upgrade before that deadline.
2. **Physical devices not completed.** The release iOS simulator covered the admin paths stated above, but current physical iOS/Android devices must still run the full admin/manager/staff/member and Hub journeys, including background/resume, token expiry, offline record/reconnect, tenant switching, push deep links, and small-screen text wrapping.
3. **Service-integration label retained.** The 112 Python cases call real services and MySQL but do not all pass through the real gateway and rendered clients. They remain service-integration tests. The separately reported iOS simulator flows and one Chromium member journey used the gateway and rendered applications.
4. **External providers mocked.** Real SMS, WhatsApp, email, push, bank/payment, and production SQS delivery were not invoked. Provider sandbox acceptance tests remain required.
5. **Gateway/browser expansion.** The new Playwright suite proves rendered values, audit filters, direct-URL capability locks and payment void behavior with deterministic API fixtures, plus one real gateway/MySQL member lifecycle. It does not claim complete full-stack E2E: add gateway-backed browser scenarios for live financial creation, concurrency outcomes and Hub/Super Admin mutations.
6. **Performance.** The web build emits a ~2.40 MB minified/~559 KB gzip main chunk warning. Add route-level code splitting before high traffic.
7. **Cold-start test capacity.** Six concurrent Spring containers approach the local 4 GB Docker limit. CI should have more memory or stage health warm-up before the first latency-sensitive request.
8. **Production data was not inspected or changed.** The read-only duplicate-settlement production query was not executed in this environment. Run only with the approved read-only procedure if production evidence is still required.
9. **Paise conversion is intentionally incomplete.** Admin wallet uses the expand/dual-write pattern. The remaining financial columns require the separately approved multi-release expand/backfill/reconcile/flip/contract plan.

## Release recommendation

The backend financial and authorization repairs are strong enough for a controlled test release. Before calling the entire web/mobile product production-ready:

1. Upgrade Expo before the pinned build-tool exception expires on 2027-01-31.
2. Run physical iOS/Android manual journeys and capture evidence.
3. Expand the new browser assertions through the real gateway for the remaining high-risk financial, Hub and capability flows.
4. Execute provider sandbox tests and confirm alert routing/runbook ownership.
5. Re-run this exact regression set after any future shared-branch application change.

No push, deployment, or production mutation was performed by this audit.
