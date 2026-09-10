package com.chitfund.paymentservice.service;

import com.chitfund.paymentservice.domain.SettlementMemberStatusSync;
import com.chitfund.paymentservice.repository.SettlementMemberStatusSyncRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class SettlementMemberStatusSyncStoreTest {
    @Mock private SettlementMemberStatusSyncRepository repository;
    @InjectMocks private SettlementMemberStatusSyncStore store;

    @Test
    void staleWorkerCannotOverwriteAReclaimedCommand() {
        UUID id = UUID.randomUUID();
        UUID staleToken = UUID.randomUUID();
        UUID currentToken = UUID.randomUUID();
        SettlementMemberStatusSync sync = SettlementMemberStatusSync.builder()
                .id(id)
                .status("PROCESSING")
                .claimToken(currentToken)
                .build();
        when(repository.findById(id)).thenReturn(Optional.of(sync));

        store.complete(id, staleToken);
        store.fail(id, staleToken, new IllegalStateException("late result"));

        assertThat(sync.getStatus()).isEqualTo("PROCESSING");
        assertThat(sync.getClaimToken()).isEqualTo(currentToken);
        assertThat(sync.getAttempts()).isZero();
    }
}
