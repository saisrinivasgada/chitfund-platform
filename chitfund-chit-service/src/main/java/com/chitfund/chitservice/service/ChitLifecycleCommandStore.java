package com.chitfund.chitservice.service;

import com.chitfund.chitservice.domain.entity.ChitLifecycleCommand;
import com.chitfund.chitservice.repository.ChitLifecycleCommandRepository;
import lombok.RequiredArgsConstructor;
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
public class ChitLifecycleCommandStore {
    static final String CLOSE_DRAWS = "CLOSE_DRAWS";

    private final ChitLifecycleCommandRepository repository;
    private final JdbcTemplate jdbcTemplate;

    @Transactional(propagation = Propagation.MANDATORY)
    public void enqueueCloseDraws(String tenantId, UUID chitId) {
        LocalDateTime now = LocalDateTime.now();
        jdbcTemplate.update("""
                INSERT INTO chit_lifecycle_commands (
                    id, tenant_id, chit_id, command_type, dedupe_key,
                    status, attempts, available_at, created_at)
                VALUES (?, ?, ?, ?, ?, 'PENDING', 0, ?, ?)
                ON DUPLICATE KEY UPDATE dedupe_key = VALUES(dedupe_key)
                """, UUID.randomUUID().toString(), tenantId, chitId.toString(), CLOSE_DRAWS,
                chitId + ":CLOSE_DRAWS", Timestamp.valueOf(now), Timestamp.valueOf(now));
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public Optional<ChitLifecycleCommand> claim(UUID id) {
        LocalDateTime now = LocalDateTime.now();
        UUID token = UUID.randomUUID();
        if (repository.claim(id, now, now.plusSeconds(30), token) != 1) {
            return Optional.empty();
        }
        return repository.findById(id);
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void complete(UUID id, UUID claimToken) {
        repository.findById(id).ifPresent(command -> {
            if (!"PROCESSING".equals(command.getStatus())
                    || !claimToken.equals(command.getClaimToken())) return;
            command.setStatus("COMPLETED");
            command.setCompletedAt(LocalDateTime.now());
            command.setClaimedUntil(null);
            command.setClaimToken(null);
            command.setLastErrorCode(null);
        });
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void fail(UUID id, UUID claimToken, Exception error) {
        repository.findById(id).ifPresent(command -> {
            if (!"PROCESSING".equals(command.getStatus())
                    || !claimToken.equals(command.getClaimToken())) return;
            int attempts = command.getAttempts() + 1;
            command.setAttempts(attempts);
            command.setStatus(attempts >= 10 ? "FAILED" : "RETRY");
            command.setAvailableAt(LocalDateTime.now()
                    .plusSeconds(Math.min(300, 1L << Math.min(attempts, 8))));
            command.setClaimedUntil(null);
            command.setClaimToken(null);
            command.setLastErrorCode(error.getClass().getSimpleName());
        });
    }

    @Transactional
    public int retryFailed(String tenantId, UUID chitId) {
        return repository.retryFailed(tenantId, chitId, LocalDateTime.now());
    }
}
