package com.chitfund.common.outbox;

import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Timestamp;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@RequiredArgsConstructor
public class DurableEventOutbox {

    private final JdbcTemplate jdbcTemplate;

    /**
     * Participates in the caller's transaction when one exists. With no caller
     * transaction the single insert is committed by the connection's autocommit.
     */
    public void enqueue(String eventId, String eventType, String payload, String destination) {
        LocalDateTime now = LocalDateTime.now(ZoneOffset.UTC);
        jdbcTemplate.update("""
                INSERT INTO domain_event_outbox (
                    delivery_id, event_id, event_type, destination, payload,
                    status, attempts, available_at, created_at)
                VALUES (?, ?, ?, ?, CAST(? AS JSON), 'PENDING', 0, ?, ?)
                """,
                UUID.randomUUID().toString(), eventId, eventType, destination,
                payload, Timestamp.valueOf(now), Timestamp.valueOf(now));
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW, isolation = Isolation.READ_COMMITTED)
    public List<EventOutboxDelivery> claimBatch(int requestedBatchSize, Duration leaseDuration) {
        int batchSize = Math.max(1, Math.min(requestedBatchSize, 500));
        String leaseToken = UUID.randomUUID().toString();
        LocalDateTime claimedUntil = LocalDateTime.now(ZoneOffset.UTC).plus(leaseDuration);
        List<EventOutboxDelivery> selected = new ArrayList<>(jdbcTemplate.query("""
                SELECT delivery_id, event_id, event_type, destination,
                       CAST(payload AS CHAR) payload, attempts
                FROM domain_event_outbox
                WHERE status = 'PENDING' AND available_at <= UTC_TIMESTAMP(6)
                ORDER BY available_at, delivery_id
                LIMIT %d
                FOR UPDATE SKIP LOCKED
                """.formatted(batchSize),
                (rs, rowNum) -> new EventOutboxDelivery(
                        rs.getString("delivery_id"), rs.getString("event_id"),
                        rs.getString("event_type"), rs.getString("destination"),
                        rs.getString("payload"), rs.getInt("attempts"), leaseToken)));

        int remaining = batchSize - selected.size();
        if (remaining > 0) {
            selected.addAll(jdbcTemplate.query("""
                    SELECT delivery_id, event_id, event_type, destination,
                           CAST(payload AS CHAR) payload, attempts
                    FROM domain_event_outbox
                    WHERE status = 'IN_FLIGHT' AND claimed_until < UTC_TIMESTAMP(6)
                    ORDER BY claimed_until, delivery_id
                    LIMIT %d
                    FOR UPDATE SKIP LOCKED
                    """.formatted(remaining),
                    (rs, rowNum) -> new EventOutboxDelivery(
                            rs.getString("delivery_id"), rs.getString("event_id"),
                            rs.getString("event_type"), rs.getString("destination"),
                            rs.getString("payload"), rs.getInt("attempts"), leaseToken)));
        }

        if (selected.isEmpty()) return List.of();
        List<Object[]> updates = new ArrayList<>(selected.size());
        for (EventOutboxDelivery delivery : selected) {
            updates.add(new Object[]{leaseToken, Timestamp.valueOf(claimedUntil), delivery.deliveryId()});
        }
        jdbcTemplate.batchUpdate("""
                UPDATE domain_event_outbox
                SET status='IN_FLIGHT', lease_token=?, claimed_until=?
                WHERE delivery_id=?
                """, updates);
        return selected;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public boolean markPublished(EventOutboxDelivery delivery) {
        return jdbcTemplate.update("""
                UPDATE domain_event_outbox
                SET status='PUBLISHED', published_at=UTC_TIMESTAMP(6),
                    lease_token=NULL, claimed_until=NULL,
                    last_error_code=NULL, last_error=NULL,
                    payload=JSON_OBJECT()
                WHERE delivery_id=? AND lease_token=? AND status='IN_FLIGHT'
                """, delivery.deliveryId(), delivery.leaseToken()) == 1;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public FailureResult markFailed(EventOutboxDelivery delivery, int maxAttempts,
                                    LocalDateTime retryAt, String errorCode,
                                    String sanitizedError) {
        int attempts = delivery.attempts() + 1;
        boolean terminal = attempts >= maxAttempts;
        int updated = jdbcTemplate.update("""
                UPDATE domain_event_outbox
                SET status=?, attempts=?, available_at=?,
                    lease_token=NULL, claimed_until=NULL,
                    last_error_code=?, last_error=?
                WHERE delivery_id=? AND lease_token=? AND status='IN_FLIGHT'
                """, terminal ? "FAILED" : "PENDING", attempts,
                Timestamp.valueOf(retryAt), errorCode, sanitizedError,
                delivery.deliveryId(), delivery.leaseToken());
        return new FailureResult(updated == 1, terminal, attempts);
    }

    public long countByStatus(String status) {
        Long count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM domain_event_outbox WHERE status=?", Long.class, status);
        return count == null ? 0 : count;
    }

    public long oldestUnpublishedAgeSeconds() {
        Long age = jdbcTemplate.queryForObject("""
                SELECT COALESCE(TIMESTAMPDIFF(SECOND, MIN(created_at), UTC_TIMESTAMP(6)), 0)
                FROM domain_event_outbox
                WHERE status IN ('PENDING', 'IN_FLIGHT')
                """, Long.class);
        return age == null ? 0 : Math.max(0, age);
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public boolean replayFailed(String deliveryId, String actorId, String reason) {
        int updated = jdbcTemplate.update("""
                UPDATE domain_event_outbox
                SET status='PENDING', attempts=0, available_at=UTC_TIMESTAMP(6),
                    lease_token=NULL, claimed_until=NULL,
                    last_error_code=NULL, last_error=NULL
                WHERE delivery_id=? AND status='FAILED'
                """, deliveryId);
        if (updated != 1) return false;
        int audited = jdbcTemplate.update("""
                INSERT INTO domain_outbox_replay_audit (
                    id, delivery_id, event_id, replayed_by, reason, replayed_at)
                SELECT ?, delivery_id, event_id, ?, ?, UTC_TIMESTAMP(6)
                FROM domain_event_outbox WHERE delivery_id=?
                """, UUID.randomUUID().toString(), actorId, reason, deliveryId);
        if (audited != 1) {
            throw new IllegalStateException("Domain outbox replay could not be recorded");
        }
        return true;
    }

    public record FailureResult(boolean updated, boolean terminal, int attempts) {}
}
