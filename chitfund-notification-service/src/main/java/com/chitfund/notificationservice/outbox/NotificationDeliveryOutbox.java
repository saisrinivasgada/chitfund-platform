package com.chitfund.notificationservice.outbox;

import lombok.RequiredArgsConstructor;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Component
@RequiredArgsConstructor
public class NotificationDeliveryOutbox {

    private final JdbcTemplate jdbcTemplate;

    /** Participates in the current inbox/business transaction when one exists. */
    public boolean enqueue(String eventId, String dedupeKey, String tenantId,
                           String notificationId, String deliveryType, String payload) {
        Instant now = Instant.now();
        try {
            return jdbcTemplate.update("""
                    INSERT INTO notification_delivery_outbox (
                        delivery_id, event_id, dedupe_key, tenant_id, notification_id,
                        delivery_type, payload, status, attempts, available_at, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, CAST(? AS JSON), 'PENDING', 0, ?, ?)
                    """, UUID.randomUUID().toString(), eventId, dedupeKey, tenantId,
                    notificationId, deliveryType, payload,
                    Timestamp.from(now), Timestamp.from(now)) == 1;
        } catch (DuplicateKeyException ignored) {
            return false;
        }
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW, isolation = Isolation.READ_COMMITTED)
    public List<NotificationDelivery> claimBatch(int requestedBatchSize, Duration leaseDuration) {
        int batchSize = Math.max(1, Math.min(requestedBatchSize, 500));
        String leaseToken = UUID.randomUUID().toString();
        Instant claimedUntil = Instant.now().plus(leaseDuration);
        List<NotificationDelivery> selected = new ArrayList<>(select("""
                status = 'PENDING' AND available_at <= UTC_TIMESTAMP(6)
                ORDER BY available_at, delivery_id
                """, batchSize, leaseToken));
        int remaining = batchSize - selected.size();
        if (remaining > 0) {
            selected.addAll(select("""
                    status = 'IN_FLIGHT' AND claimed_until < UTC_TIMESTAMP(6)
                    ORDER BY claimed_until, delivery_id
                    """, remaining, leaseToken));
        }
        if (selected.isEmpty()) return List.of();

        List<Object[]> updates = new ArrayList<>(selected.size());
        for (NotificationDelivery delivery : selected) {
            updates.add(new Object[]{leaseToken, Timestamp.from(claimedUntil), delivery.deliveryId()});
        }
        jdbcTemplate.batchUpdate("""
                UPDATE notification_delivery_outbox
                SET status='IN_FLIGHT', lease_token=?, claimed_until=?
                WHERE delivery_id=?
                """, updates);
        return selected;
    }

    private List<NotificationDelivery> select(String predicate, int limit, String leaseToken) {
        return jdbcTemplate.query("""
                SELECT delivery_id, event_id, tenant_id, notification_id, delivery_type,
                       CAST(payload AS CHAR) payload, attempts
                FROM notification_delivery_outbox
                WHERE %s
                LIMIT %d
                FOR UPDATE SKIP LOCKED
                """.formatted(predicate, limit), (rs, rowNum) -> new NotificationDelivery(
                rs.getString("delivery_id"), rs.getString("event_id"),
                rs.getString("tenant_id"), rs.getString("notification_id"),
                rs.getString("delivery_type"), rs.getString("payload"),
                rs.getInt("attempts"), leaseToken));
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public boolean markPublished(NotificationDelivery delivery, String externalId) {
        int updated = jdbcTemplate.update("""
                UPDATE notification_delivery_outbox
                SET status='PUBLISHED', published_at=UTC_TIMESTAMP(6), payload=JSON_OBJECT(),
                    lease_token=NULL, claimed_until=NULL, last_error_code=NULL, last_error=NULL
                WHERE delivery_id=? AND lease_token=? AND status='IN_FLIGHT'
                """, delivery.deliveryId(), delivery.leaseToken());
        if (updated == 1 && delivery.notificationId() != null) {
            int notificationUpdated = jdbcTemplate.update("""
                    UPDATE notifications
                    SET status='SENT', external_id=?, sent_at=UTC_TIMESTAMP(6), error_message=NULL
                    WHERE id=?
                    """, externalId, delivery.notificationId());
            if (notificationUpdated != 1) {
                throw new IllegalStateException("Notification history row is missing");
            }
        }
        return updated == 1;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public FailureResult markFailed(NotificationDelivery delivery, int maxAttempts,
                                    LocalDateTime retryAt, String errorCode,
                                    String sanitizedError) {
        int attempts = delivery.attempts() + 1;
        boolean terminal = attempts >= maxAttempts;
        int updated = jdbcTemplate.update("""
                UPDATE notification_delivery_outbox
                SET status=?, attempts=?, available_at=?, lease_token=NULL, claimed_until=NULL,
                    last_error_code=?, last_error=?
                WHERE delivery_id=? AND lease_token=? AND status='IN_FLIGHT'
                """, terminal ? "FAILED" : "PENDING", attempts,
                Timestamp.from(retryAt.toInstant(ZoneOffset.UTC)),
                errorCode, sanitizedError, delivery.deliveryId(), delivery.leaseToken());
        if (updated == 1 && terminal && delivery.notificationId() != null) {
            int notificationUpdated = jdbcTemplate.update("""
                    UPDATE notifications SET status='FAILED', error_message=? WHERE id=?
                    """, sanitizedError, delivery.notificationId());
            if (notificationUpdated != 1) {
                throw new IllegalStateException("Notification history row is missing");
            }
        }
        return new FailureResult(updated == 1, terminal, attempts);
    }

    public long countByStatus(String status) {
        Long count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM notification_delivery_outbox WHERE status=?",
                Long.class, status);
        return count == null ? 0 : count;
    }

    public long oldestUnpublishedAgeSeconds() {
        Long age = jdbcTemplate.queryForObject("""
                SELECT COALESCE(TIMESTAMPDIFF(SECOND, MIN(created_at), UTC_TIMESTAMP(6)), 0)
                FROM notification_delivery_outbox WHERE status IN ('PENDING', 'IN_FLIGHT')
                """, Long.class);
        return age == null ? 0 : Math.max(0, age);
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public boolean replayFailed(String deliveryId, String actorId, String reason) {
        int updated = jdbcTemplate.update("""
                UPDATE notification_delivery_outbox
                SET status='PENDING', attempts=0, available_at=UTC_TIMESTAMP(6),
                    lease_token=NULL, claimed_until=NULL,
                    last_error_code=NULL, last_error=NULL
                WHERE delivery_id=? AND status='FAILED'
                """, deliveryId);
        if (updated != 1) return false;

        jdbcTemplate.update("""
                UPDATE notifications
                SET status='PENDING', error_message=NULL
                WHERE id=(
                    SELECT notification_id FROM notification_delivery_outbox
                    WHERE delivery_id=?
                ) AND status='FAILED'
                """, deliveryId);

        int audited = jdbcTemplate.update("""
                INSERT INTO notification_delivery_replay_audit (
                    id, delivery_id, event_id, tenant_id, replayed_by, reason, replayed_at)
                SELECT ?, delivery_id, event_id, tenant_id, ?, ?, UTC_TIMESTAMP(6)
                FROM notification_delivery_outbox WHERE delivery_id=?
                """, UUID.randomUUID().toString(), actorId, reason, deliveryId);
        if (audited != 1) {
            throw new IllegalStateException("Notification delivery replay could not be recorded");
        }
        return true;
    }

    public record FailureResult(boolean updated, boolean terminal, int attempts) { }
}
