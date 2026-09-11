# Financial event outbox runbook

This runbook applies to payment-service and payout-service. Their Prometheus
endpoints are authenticated; expose them only to the monitoring network and do
not make `/actuator/prometheus` public through the gateway.

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
