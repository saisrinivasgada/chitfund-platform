package com.chitfund.payoutservice.service;

import com.chitfund.common.exception.BusinessException;
import com.chitfund.common.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.Optional;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class PayoutCreationIdempotencyStore {

    private final JdbcTemplate jdbcTemplate;

    /**
     * Atomically reserves and locks a tenant-scoped idempotency key. A concurrent
     * request waits for the first transaction and then observes its committed result.
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public Optional<UUID> claim(String tenantId, String key, String requestHash) {
        jdbcTemplate.update("""
                INSERT INTO payout_creation_idempotency
                    (tenant_id, idempotency_key, request_hash, created_at)
                VALUES (?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE idempotency_key = VALUES(idempotency_key)
                """, tenantId, key, requestHash, Timestamp.valueOf(LocalDateTime.now()));

        return jdbcTemplate.queryForObject("""
                SELECT request_hash, payout_id
                FROM payout_creation_idempotency
                WHERE tenant_id = ? AND idempotency_key = ?
                FOR UPDATE
                """, (resultSet, rowNumber) -> {
            String storedHash = resultSet.getString("request_hash");
            if (!requestHash.equals(storedHash)) {
                throw new BusinessException(ErrorCode.CONCURRENT_MODIFICATION,
                        "Idempotency key was already used with different payout details",
                        HttpStatus.CONFLICT);
            }
            String payoutId = resultSet.getString("payout_id");
            return payoutId == null ? Optional.empty() : Optional.of(UUID.fromString(payoutId));
        }, tenantId, key);
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void complete(String tenantId, String key, String requestHash, UUID payoutId) {
        int updated = jdbcTemplate.update("""
                UPDATE payout_creation_idempotency
                SET payout_id = ?
                WHERE tenant_id = ? AND idempotency_key = ?
                  AND request_hash = ? AND payout_id IS NULL
                """, payoutId.toString(), tenantId, key, requestHash);
        if (updated != 1) {
            throw new IllegalStateException("Payout idempotency reservation could not be completed");
        }
    }
}
