package com.chitfund.payoutservice.service;

import com.chitfund.payoutservice.domain.PayoutFinancialCommand;
import com.chitfund.payoutservice.repository.PayoutFinancialCommandRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.Optional;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class PayoutFinancialCommandStore {
    private final PayoutFinancialCommandRepository repository;

    @Transactional(propagation = Propagation.MANDATORY)
    public PayoutFinancialCommand enqueue(PayoutFinancialCommand command) {
        command.setId(UUID.randomUUID());
        command.setSequenceNo(repository.findMaxSequence(command.getPayoutId()) + 1);
        command.setStatus("PENDING");
        command.setAttempts(0);
        command.setAvailableAt(LocalDateTime.now());
        command.setCreatedAt(LocalDateTime.now());
        // Flush so another command queued in this same payout transaction sees
        // this sequence number when it calculates its own position.
        return repository.saveAndFlush(command);
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public Optional<PayoutFinancialCommand> claim(UUID id) {
        LocalDateTime now = LocalDateTime.now();
        UUID token = UUID.randomUUID();
        if (repository.claim(id, now, now.plusSeconds(30), token) != 1) return Optional.empty();
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
    public int retryFailed(UUID payoutId) {
        return repository.retryFailed(payoutId, LocalDateTime.now());
    }
}
