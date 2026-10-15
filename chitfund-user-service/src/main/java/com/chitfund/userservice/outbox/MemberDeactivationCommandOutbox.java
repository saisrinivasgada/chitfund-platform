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
public class MemberDeactivationCommandOutbox {
    private final JdbcTemplate jdbcTemplate;

    public void enqueue(UUID requestId, UUID tenantId, UUID memberId, UUID userId) {
        Instant now = Instant.now();
        jdbcTemplate.update("""
                INSERT INTO member_deactivation_command_outbox (
                    delivery_id, request_id, tenant_id, member_id, user_id,
                    status, attempts, next_attempt_after, created_at)
                VALUES (?, ?, ?, ?, ?, 'PENDING', 0, ?, ?)
                ON DUPLICATE KEY UPDATE request_id=request_id
                """, UUID.randomUUID().toString(), requestId.toString(), tenantId.toString(),
                memberId.toString(), userId.toString(), Timestamp.from(now), Timestamp.from(now));
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW, isolation = Isolation.READ_COMMITTED)
    public List<MemberDeactivationCommand> claimBatch(int requestedBatchSize, Duration leaseDuration) {
        int batchSize = Math.max(1, Math.min(requestedBatchSize, 500));
        String leaseToken = UUID.randomUUID().toString();
        Instant claimedUntil = Instant.now().plus(leaseDuration);
        List<MemberDeactivationCommand> selected = new ArrayList<>(jdbcTemplate.query("""
                SELECT delivery_id, request_id, tenant_id, member_id, user_id, attempts
                FROM member_deactivation_command_outbox
                WHERE status='PENDING' AND next_attempt_after <= UTC_TIMESTAMP(6)
                ORDER BY next_attempt_after, delivery_id
                LIMIT %d FOR UPDATE SKIP LOCKED
                """.formatted(batchSize), (rs, rowNum) -> new MemberDeactivationCommand(
                rs.getString("delivery_id"), UUID.fromString(rs.getString("request_id")),
                UUID.fromString(rs.getString("tenant_id")), UUID.fromString(rs.getString("member_id")),
                UUID.fromString(rs.getString("user_id")), rs.getInt("attempts"), leaseToken)));

        int remaining = batchSize - selected.size();
        if (remaining > 0) {
            selected.addAll(jdbcTemplate.query("""
                    SELECT delivery_id, request_id, tenant_id, member_id, user_id, attempts
                    FROM member_deactivation_command_outbox
                    WHERE status='IN_FLIGHT' AND lease_expires_at < UTC_TIMESTAMP(6)
                    ORDER BY lease_expires_at, delivery_id
                    LIMIT %d FOR UPDATE SKIP LOCKED
                    """.formatted(remaining), (rs, rowNum) -> new MemberDeactivationCommand(
                    rs.getString("delivery_id"), UUID.fromString(rs.getString("request_id")),
                    UUID.fromString(rs.getString("tenant_id")), UUID.fromString(rs.getString("member_id")),
                    UUID.fromString(rs.getString("user_id")), rs.getInt("attempts"), leaseToken)));
        }

        if (selected.isEmpty()) return List.of();
        List<Object[]> updates = selected.stream()
                .map(c -> new Object[]{leaseToken, Timestamp.from(claimedUntil), c.deliveryId()})
                .toList();
        jdbcTemplate.batchUpdate("""
                UPDATE member_deactivation_command_outbox
                SET status='IN_FLIGHT', lease_token=?, lease_expires_at=?
                WHERE delivery_id=?
                """, updates);
        return selected;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public boolean markCompleted(MemberDeactivationCommand command) {
        return jdbcTemplate.update("""
                UPDATE member_deactivation_command_outbox
                SET status='COMPLETED', lease_token=NULL, lease_expires_at=NULL,
                    last_error_type=NULL, last_error_msg=NULL
                WHERE delivery_id=? AND lease_token=? AND status='IN_FLIGHT'
                """, command.deliveryId(), command.leaseToken()) == 1;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public FailureResult markFailed(MemberDeactivationCommand command, int maxAttempts,
                                    LocalDateTime retryAt, String errorType, String errorMsg) {
        int attempts = command.attempts() + 1;
        boolean terminal = attempts >= maxAttempts;
        int updated = jdbcTemplate.update("""
                UPDATE member_deactivation_command_outbox
                SET status=?, attempts=?, next_attempt_after=?, lease_token=NULL, lease_expires_at=NULL,
                    last_error_type=?, last_error_msg=?
                WHERE delivery_id=? AND lease_token=? AND status='IN_FLIGHT'
                """, terminal ? "FAILED" : "PENDING", attempts,
                Timestamp.from(retryAt.toInstant(ZoneOffset.UTC)),
                errorType, errorMsg, command.deliveryId(), command.leaseToken());
        return new FailureResult(updated == 1, terminal, attempts);
    }

    public long countByStatus(String status) {
        Long count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM member_deactivation_command_outbox WHERE status=?", Long.class, status);
        return count == null ? 0 : count;
    }

    public record FailureResult(boolean updated, boolean terminal, int attempts) {}
}
