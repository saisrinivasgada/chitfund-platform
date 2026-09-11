package com.chitfund.payoutservice.kafka;

import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
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

@Repository
@RequiredArgsConstructor
public class PayoutOutboxStore {

    private final JdbcTemplate jdbcTemplate;

    @Transactional(propagation = Propagation.MANDATORY)
    public void enqueue(String eventId, String tenantId, String aggregateId,
                        String eventType, String payload, List<String> destinations) {
        LocalDateTime now = LocalDateTime.now(ZoneOffset.UTC);
        for (String destination : destinations) {
            jdbcTemplate.update("""
                    INSERT INTO event_outbox (
                        delivery_id, event_id, tenant_id, aggregate_type, aggregate_id,
                        event_type, destination, payload, status, attempts,
                        available_at, created_at)
                    VALUES (?, ?, ?, 'PAYOUT', ?, ?, ?, CAST(? AS JSON),
                            'PENDING', 0, ?, ?)
                    """, UUID.randomUUID().toString(), eventId, tenantId, aggregateId,
                    eventType, destination, payload, Timestamp.valueOf(now), Timestamp.valueOf(now));
        }
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW, isolation = Isolation.READ_COMMITTED)
    public List<OutboxDelivery> claimBatch(int requestedBatchSize, Duration leaseDuration) {
        int batchSize = Math.max(1, Math.min(requestedBatchSize, 500));
        String leaseToken = UUID.randomUUID().toString();
        LocalDateTime claimedUntil = LocalDateTime.now(ZoneOffset.UTC).plus(leaseDuration);
        List<OutboxDelivery> selected = new ArrayList<>(selectEligible(
                "status='PENDING' AND available_at <= UTC_TIMESTAMP(6)",
                "available_at", batchSize, leaseToken));
        int remaining = batchSize - selected.size();
        if (remaining > 0) {
            selected.addAll(selectEligible(
                    "status='IN_FLIGHT' AND claimed_until < UTC_TIMESTAMP(6)",
                    "claimed_until", remaining, leaseToken));
        }
        if (selected.isEmpty()) return List.of();

        List<Object[]> updates = selected.stream()
                .map(delivery -> new Object[]{leaseToken, Timestamp.valueOf(claimedUntil),
                        delivery.deliveryId()})
                .toList();
        jdbcTemplate.batchUpdate("""
                UPDATE event_outbox SET status='IN_FLIGHT', lease_token=?, claimed_until=?
                WHERE delivery_id=?
                """, updates);
        return selected;
    }

    private List<OutboxDelivery> selectEligible(String predicate, String orderColumn,
                                                 int limit, String leaseToken) {
        return jdbcTemplate.query("""
                SELECT delivery_id, event_id, event_type, destination,
                       CAST(payload AS CHAR) payload, attempts
                FROM event_outbox
                WHERE %s
                ORDER BY %s, delivery_id
                LIMIT %d
                FOR UPDATE SKIP LOCKED
                """.formatted(predicate, orderColumn, limit),
                (rs, rowNum) -> new OutboxDelivery(
                        rs.getString("delivery_id"), rs.getString("event_id"),
                        rs.getString("event_type"), rs.getString("destination"),
                        rs.getString("payload"), rs.getInt("attempts"), leaseToken));
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public boolean markPublished(OutboxDelivery delivery) {
        return jdbcTemplate.update("""
                UPDATE event_outbox
                SET status='PUBLISHED', published_at=UTC_TIMESTAMP(6),
                    lease_token=NULL, claimed_until=NULL,
                    last_error_code=NULL, last_error=NULL
                WHERE delivery_id=? AND lease_token=? AND status='IN_FLIGHT'
                """, delivery.deliveryId(), delivery.leaseToken()) == 1;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public FailureResult markFailed(OutboxDelivery delivery, int maxAttempts,
                                    LocalDateTime retryAt, String errorCode,
                                    String sanitizedError) {
        int attempts = delivery.attempts() + 1;
        boolean terminal = attempts >= maxAttempts;
        int updated = jdbcTemplate.update("""
                UPDATE event_outbox
                SET status=?, attempts=?, available_at=?, lease_token=NULL,
                    claimed_until=NULL, last_error_code=?, last_error=?
                WHERE delivery_id=? AND lease_token=? AND status='IN_FLIGHT'
                """, terminal ? "FAILED" : "PENDING", attempts,
                Timestamp.valueOf(retryAt), errorCode, sanitizedError,
                delivery.deliveryId(), delivery.leaseToken());
        return new FailureResult(updated == 1, terminal, attempts);
    }

    public long countByStatus(String status) {
        Long count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM event_outbox WHERE status=?", Long.class, status);
        return count == null ? 0 : count;
    }

    public long oldestUnpublishedAgeSeconds() {
        Long age = jdbcTemplate.queryForObject("""
                SELECT COALESCE(TIMESTAMPDIFF(SECOND, MIN(created_at), UTC_TIMESTAMP(6)), 0)
                FROM event_outbox WHERE status IN ('PENDING', 'IN_FLIGHT')
                """, Long.class);
        return age == null ? 0 : Math.max(0, age);
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public boolean replayFailed(String deliveryId, String tenantId,
                                String actorId, String reason) {
        int updated = jdbcTemplate.update("""
                UPDATE event_outbox
                SET status='PENDING', attempts=0, available_at=UTC_TIMESTAMP(6),
                    lease_token=NULL, claimed_until=NULL,
                    last_error_code=NULL, last_error=NULL
                WHERE delivery_id=? AND tenant_id=? AND status='FAILED'
                """, deliveryId, tenantId);
        if (updated != 1) return false;
        jdbcTemplate.update("""
                INSERT INTO event_outbox_replay_audit (
                    id, delivery_id, tenant_id, replayed_by, reason, replayed_at)
                VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP(6))
                """, UUID.randomUUID().toString(), deliveryId, tenantId, actorId, reason);
        return true;
    }

    public record FailureResult(boolean updated, boolean terminal, int attempts) {}
}
