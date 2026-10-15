package com.chitfund.userservice.outbox;

import lombok.RequiredArgsConstructor;
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
public class SetupEmailOutbox {
    private final JdbcTemplate jdbcTemplate;

    /**
     * Enqueue a new setup email delivery. Each call creates a distinct row so
     * resend history is preserved. The generated-column unique index on
     * active_request_guard prevents two concurrent PENDING/IN_FLIGHT rows for
     * the same request — call supersede() first when replacing an active delivery.
     */
    public void enqueue(UUID requestId, UUID candidateUserId, String toEmail,
                        String fullName, String orgName) {
        Instant now = Instant.now();
        jdbcTemplate.update("""
                INSERT INTO setup_email_outbox (
                    delivery_id, request_id, candidate_user_id, to_email, full_name, org_name,
                    status, attempts, available_at, created_at)
                VALUES (?, ?, ?, ?, ?, ?, 'PENDING', 0, ?, ?)
                """, UUID.randomUUID().toString(), requestId.toString(),
                candidateUserId.toString(), toEmail, fullName, orgName,
                Timestamp.from(now), Timestamp.from(now));
    }

    /**
     * Marks any open entry for this request SUPERSEDED before inserting a new
     * one on resend. Called inside the same transaction as the new enqueue so
     * the two operations are atomic.
     */
    public void supersede(UUID requestId) {
        jdbcTemplate.update("""
                UPDATE setup_email_outbox
                SET status='SUPERSEDED', completed_at=UTC_TIMESTAMP(6), lease_token=NULL, claimed_until=NULL
                WHERE request_id=? AND status IN ('PENDING','IN_FLIGHT')
                """, requestId.toString());
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW, isolation = Isolation.READ_COMMITTED)
    public List<SetupEmailCommand> claimBatch(int requestedBatchSize, Duration leaseDuration) {
        int batchSize = Math.max(1, Math.min(requestedBatchSize, 500));
        String leaseToken = UUID.randomUUID().toString();
        Instant claimedUntil = Instant.now().plus(leaseDuration);
        List<SetupEmailCommand> selected = new ArrayList<>(jdbcTemplate.query("""
                SELECT delivery_id, request_id, candidate_user_id, to_email, full_name, org_name, attempts
                FROM setup_email_outbox
                WHERE status='PENDING' AND available_at <= UTC_TIMESTAMP(6)
                ORDER BY available_at, delivery_id
                LIMIT %d FOR UPDATE SKIP LOCKED
                """.formatted(batchSize), (rs, rowNum) -> new SetupEmailCommand(
                rs.getString("delivery_id"),
                UUID.fromString(rs.getString("request_id")),
                UUID.fromString(rs.getString("candidate_user_id")),
                rs.getString("to_email"),
                rs.getString("full_name"),
                rs.getString("org_name"),
                rs.getInt("attempts"), leaseToken)));

        int remaining = batchSize - selected.size();
        if (remaining > 0) {
            selected.addAll(jdbcTemplate.query("""
                    SELECT delivery_id, request_id, candidate_user_id, to_email, full_name, org_name, attempts
                    FROM setup_email_outbox
                    WHERE status='IN_FLIGHT' AND claimed_until < UTC_TIMESTAMP(6)
                    ORDER BY claimed_until, delivery_id
                    LIMIT %d FOR UPDATE SKIP LOCKED
                    """.formatted(remaining), (rs, rowNum) -> new SetupEmailCommand(
                    rs.getString("delivery_id"),
                    UUID.fromString(rs.getString("request_id")),
                    UUID.fromString(rs.getString("candidate_user_id")),
                    rs.getString("to_email"),
                    rs.getString("full_name"),
                    rs.getString("org_name"),
                    rs.getInt("attempts"), leaseToken)));
        }

        if (selected.isEmpty()) return List.of();
        List<Object[]> updates = selected.stream()
                .map(cmd -> new Object[]{leaseToken, Timestamp.from(claimedUntil), cmd.deliveryId()})
                .toList();
        jdbcTemplate.batchUpdate("""
                UPDATE setup_email_outbox
                SET status='IN_FLIGHT', lease_token=?, claimed_until=?
                WHERE delivery_id=?
                """, updates);
        return selected;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public boolean markCompleted(SetupEmailCommand command) {
        return jdbcTemplate.update("""
                UPDATE setup_email_outbox
                SET status='COMPLETED', completed_at=UTC_TIMESTAMP(6),
                    lease_token=NULL, claimed_until=NULL, last_error_code=NULL, last_error=NULL
                WHERE delivery_id=? AND lease_token=? AND status='IN_FLIGHT'
                """, command.deliveryId(), command.leaseToken()) == 1;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public FailureResult markFailed(SetupEmailCommand command, int maxAttempts,
                                    LocalDateTime retryAt, String errorCode, String error) {
        int attempts = command.attempts() + 1;
        boolean terminal = attempts >= maxAttempts;
        int updated = jdbcTemplate.update("""
                UPDATE setup_email_outbox
                SET status=?, attempts=?, available_at=?, lease_token=NULL, claimed_until=NULL,
                    last_error_code=?, last_error=?
                WHERE delivery_id=? AND lease_token=? AND status='IN_FLIGHT'
                """, terminal ? "FAILED" : "PENDING", attempts,
                Timestamp.from(retryAt.toInstant(ZoneOffset.UTC)),
                errorCode, error, command.deliveryId(), command.leaseToken());
        return new FailureResult(updated == 1, terminal, attempts);
    }

    /**
     * Atomically marks the delivery COMPLETED and updates setup_email_status on
     * the request to SENT. Both updates run in a single REQUIRES_NEW transaction
     * so a crash between them is impossible — either both commit or neither does.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public boolean markCompletedAndDelivered(SetupEmailCommand command) {
        int outboxUpdated = jdbcTemplate.update("""
                UPDATE setup_email_outbox
                SET status='COMPLETED', completed_at=UTC_TIMESTAMP(6),
                    lease_token=NULL, claimed_until=NULL, last_error_code=NULL, last_error=NULL
                WHERE delivery_id=? AND lease_token=? AND status='IN_FLIGHT'
                """, command.deliveryId(), command.leaseToken());
        if (outboxUpdated == 0) return false;
        int requestUpdated = jdbcTemplate.update("""
                UPDATE chitfund_access_requests
                SET setup_email_status='SENT', setup_email_sent_at=UTC_TIMESTAMP(6)
                WHERE id=? AND setup_email_status IN ('PENDING','FAILED')
                """, command.requestId().toString());
        if (requestUpdated != 1) {
            throw new IllegalStateException("Setup-email request delivery state was not finalizable");
        }
        return true;
    }

    /**
     * Atomically marks a terminal delivery failure and updates setup_email_status
     * on the request to FAILED. Both updates run in a single REQUIRES_NEW
     * transaction.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public boolean markTerminalFailure(SetupEmailCommand command, int attempts,
                                       LocalDateTime retryAt, String errorCode, String error) {
        int updated = jdbcTemplate.update("""
                UPDATE setup_email_outbox
                SET status='FAILED', attempts=?, available_at=?,
                    lease_token=NULL, claimed_until=NULL, last_error_code=?, last_error=?
                WHERE delivery_id=? AND lease_token=? AND status='IN_FLIGHT'
                """, attempts, Timestamp.from(retryAt.toInstant(ZoneOffset.UTC)),
                errorCode, error, command.deliveryId(), command.leaseToken());
        if (updated == 0) return false;
        int requestUpdated = jdbcTemplate.update("""
                UPDATE chitfund_access_requests
                SET setup_email_status='FAILED'
                WHERE id=? AND setup_email_status IN ('PENDING','SENT')
                """, command.requestId().toString());
        if (requestUpdated != 1) {
            throw new IllegalStateException("Setup-email request failure state was not finalizable");
        }
        return true;
    }

    public long countByStatus(String status) {
        Long count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM setup_email_outbox WHERE status=?", Long.class, status);
        return count == null ? 0 : count;
    }

    public record FailureResult(boolean updated, boolean terminal, int attempts) {}
}
