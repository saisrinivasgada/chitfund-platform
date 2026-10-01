# Event and audit outbox runbook

The financial/domain-event procedure applies to payment-service and
payout-service. The audit-evidence procedure also applies to member-service,
chit-service, user-service and management-service. Prometheus endpoints are
authenticated; expose them only to the monitoring network and do not make
`/actuator/prometheus` public through the gateway.

## When an alert fires

1. Identify the service from the alert's `service` label.
2. Check the current `FAILED`, `PENDING`, and `IN_FLIGHT` counts and the oldest
   unpublished age. Do not edit the database row.
3. Confirm the destination queue and downstream consumer are healthy.
4. Inspect `last_error_code` and the sanitized `last_error`. Do not copy event
   payloads or member identifiers into incident chat.
5. After the dependency has recovered, replay through the service endpoint:

   `POST /admin/outbox/{deliveryId}/replay`

   with an ADMIN token for the same tenant and JSON body:

   `{"reason":"INC-123 dependency recovered; replay approved"}`

   A different tenant deliberately receives `404`, even if the delivery exists.
6. Verify the row reaches `PUBLISHED`, the failed gauge returns to zero, and the
   consumer inbox contains the stable `event_id`. Re-delivery is expected; the
   consumer inbox makes the database side effect idempotent.

## Audit-evidence alerts

The `chitwise_audit_outbox_*` metrics cover the dedicated audit outboxes used
by member-service, chit-service, user-service and management-service. A stale or
failed audit delivery means the business transaction committed, but the
organization Activity Center may be incomplete. Treat it as an evidence gap,
not as a cosmetic notification failure.

1. Identify the service from the alert's `service` label and record the alert
   start time and correlation ID without copying the event payload.
2. Confirm the audit queue and audit-service consumer are healthy. Check the
   audit consumer's inbox and failed-message metrics before changing producer
   state.
3. Inspect only `status`, `attempts`, `destination`, `last_error_code`, the
   sanitized `last_error`, and timestamps in `audit_event_outbox`. Do not paste
   payloads, actor IDs, entity IDs, or tenant IDs into incident chat.
4. `PENDING` and expired `IN_FLIGHT` rows are reclaimed automatically. Do not
   edit their lease fields or start a second ad-hoc publisher.
5. A `FAILED` row is terminal after the configured retry limit. Do not delete,
   mark it published, or manually send its payload. Escalate it as an unresolved
   audit-evidence incident until the service's protected replay operation has
   re-queued the same stable event ID.
6. After recovery, verify the original event ID exists once in the audit
   consumer inbox and Activity Center, and that the failed gauge returns to
   zero. A second delivery is safe only because the consumer inbox deduplicates
   that stable event ID.

The dedicated audit outboxes do not yet expose their protected replay operation.
The alerts deliberately remain critical until that release-blocking operational
gap is implemented; direct database edits are not an acceptable workaround.

## Retention

Retention is disabled by default. When explicitly enabled, each service deletes
at most `CHITWISE_EVENTS_RETENTION_BATCH_SIZE` rows per daily run and only rows
that are all of the following:

- `PUBLISHED`;
- older than `CHITWISE_EVENTS_RETENTION_DAYS` (minimum 7, default 90);
- never manually replayed.

`PENDING`, `IN_FLIGHT`, `FAILED`, and replay-audited rows are retained. Enable
retention only after event-payload retention has been approved for the relevant
jurisdiction and backups cover the required audit period.

## Never do this

- Do not set a failed row to `PUBLISHED` manually.
- Do not delete failed rows to clear an alert.
- Do not replay using another tenant's token.
- Do not place authorization headers, passwords, API keys, or payloads in the
  replay reason.
