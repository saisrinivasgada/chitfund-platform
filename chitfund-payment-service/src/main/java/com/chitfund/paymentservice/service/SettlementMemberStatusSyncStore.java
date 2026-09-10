package com.chitfund.paymentservice.service;

import com.chitfund.paymentservice.domain.SettlementMemberStatusSync;
import com.chitfund.paymentservice.repository.SettlementMemberStatusSyncRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.Optional;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class SettlementMemberStatusSyncStore {
    private final SettlementMemberStatusSyncRepository repository;

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public Optional<SettlementMemberStatusSync> claim(UUID id) {
        LocalDateTime now = LocalDateTime.now();
        UUID claimToken = UUID.randomUUID();
        if (repository.claim(id, now, now.plusSeconds(30), claimToken) != 1) return Optional.empty();
        return repository.findById(id);
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void complete(UUID id, UUID claimToken) {
        repository.findById(id).ifPresent(sync -> {
            if (!"PROCESSING".equals(sync.getStatus())
                    || !claimToken.equals(sync.getClaimToken())) return;
            sync.setStatus("COMPLETED");
            sync.setCompletedAt(LocalDateTime.now());
            sync.setLastError(null);
            sync.setClaimedUntil(null);
            sync.setClaimToken(null);
        });
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void fail(UUID id, UUID claimToken, Exception error) {
        repository.findById(id).ifPresent(sync -> {
            if (!"PROCESSING".equals(sync.getStatus())
                    || !claimToken.equals(sync.getClaimToken())) return;
            int attempts = sync.getAttempts() + 1;
            sync.setAttempts(attempts);
            sync.setStatus("FAILED");
            sync.setAvailableAt(LocalDateTime.now().plusSeconds(Math.min(300, 1L << Math.min(attempts, 8))));
            sync.setClaimedUntil(null);
            sync.setClaimToken(null);
            // Do not persist exception messages: HTTP client failures can include
            // internal URLs, headers or provider details.
            sync.setLastError(error.getClass().getSimpleName() + ": member status sync failed");
        });
    }
}
