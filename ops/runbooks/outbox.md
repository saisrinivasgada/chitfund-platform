# Event and audit outbox runbook

The financial/domain-event procedure applies to payment-service and
payout-service. The audit-evidence procedure also applies to member-service,
chit-service, user-service and management-service. Prometheus endpoints are
available directly on the service network for scraping; expose them only to the monitoring network and do not make
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
   mark it published, or manually send its payload. After the dependency is
   healthy, use the protected internal replay operation below; it re-queues the
   same row and therefore preserves the stable event ID.
6. After recovery, verify the original event ID exists once in the audit
   consumer inbox and Activity Center, and that the failed gauge returns to
   zero. A second delivery is safe only because the consumer inbox deduplicates
   that stable event ID.

Replay is deliberately an internal-network operation and is not routed through
the public gateway:

`POST /internal/operations/outboxes/audit/{deliveryId}/replay`

Send the service credential in `X-Internal-Key` (`X-Internal-Auth` for the
management service), the authenticated runbook operator identity in
`X-Operator-Id`, and `{"reason":"INC-123 dependency recovered"}`. Retrieve the
credential from the approved secret manager; never paste it into the command
history, ticket, report or chat. Every successful replay writes the original
event ID, actor, reason and timestamp to `audit_outbox_replay_audit`.

## Shared domain-event alerts

The `chitwise_event_outbox_*` metrics cover the shared transactional outboxes in
member-service, chit-service, user-service and management-service. They carry
events such as member/account activation, chit lifecycle changes, invitations
and transactional Hub email commands. A stale or failed row can leave services
out of sync or prevent a user from receiving a required account message.

Use the same privacy and lease rules as the audit procedure above. First confirm
the destination queue and consumer are healthy, then inspect only operational
columns and sanitized errors. `PENDING` and expired `IN_FLIGHT` rows retry
automatically. `FAILED` rows must not be edited, deleted or sent manually.

Replay a terminal shared-domain row through the same protected internal API with
kind `domain`:

`POST /internal/operations/outboxes/domain/{deliveryId}/replay`

The operation accepts only a `FAILED` row, preserves its stable event ID, and
records actor, reason and timestamp in `domain_outbox_replay_audit`. A second
request while the row is pending returns not found instead of creating another
delivery. A database update is not a replay API and must not be used.

## Notification-delivery alerts

The `chitwise_notification_delivery_*` metrics cover the notification-service
provider outbox for Expo push, transactional email, SMS and WhatsApp. The SQS
consumer commits its inbox claim, in-app notification and provider-delivery row
together. The relay then leases rows in a short transaction and contacts the
provider after the database lock has been released.

1. Check `PENDING`, `IN_FLIGHT` and `FAILED` counts without reading the payload.
   Pending payloads contain delivery addresses and message contents.
2. Confirm Expo, SES or the selected messaging provider is healthy and that its
   credentials/quotas are valid. Never paste credentials, recipient data or
   message bodies into incident chat.
3. Expired `IN_FLIGHT` rows are reclaimed automatically. `FAILED` rows are
   retained after ten attempts and must not be deleted or edited.
4. After the provider is healthy, replay a terminal delivery using the internal
   service-network endpoint:

   `POST /internal/operations/notification-deliveries/{deliveryId}/replay`

   Send `X-Internal-Key`, `X-Operator-Id` and a body such as
   `{"reason":"INC-123 provider recovered"}`. Read the credential from the
   approved secret manager without placing it in command history. The operation
   accepts only a `FAILED` row, preserves its stable event ID, restores linked
   notification history to `PENDING`, and records the actor, reason and time in
   `notification_delivery_replay_audit`.
5. Provider delivery is at-least-once. If the process dies after a provider
   accepts a message but before the row is marked `PUBLISHED`, the expired lease
   is retried and the recipient may receive a duplicate. Use provider
   idempotency when supported; Expo does not provide an exactly-once guarantee.

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
