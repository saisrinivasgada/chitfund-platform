package com.chitfund.chitservice.service;

import com.chitfund.chitservice.domain.entity.ChitLifecycleCommand;
import com.chitfund.chitservice.repository.ChitLifecycleCommandRepository;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ChitLifecycleCommandStoreTest {

    @Test
    void tenthFailureBecomesVisibleAndStopsAutomaticRetry() {
        ChitLifecycleCommandRepository repository = mock(ChitLifecycleCommandRepository.class);
        ChitLifecycleCommand command = ChitLifecycleCommand.builder()
                .id(UUID.randomUUID()).status("PROCESSING").attempts(9)
                .claimToken(UUID.randomUUID()).build();
        when(repository.findByIdForUpdate(command.getId())).thenReturn(Optional.of(command));

        new ChitLifecycleCommandStore(repository, mock(JdbcTemplate.class))
                .fail(command.getId(), command.getClaimToken(), new IllegalStateException());

        assertThat(command.getStatus()).isEqualTo("FAILED");
        assertThat(command.getAttempts()).isEqualTo(10);
        assertThat(command.getLastErrorCode()).isEqualTo("IllegalStateException");
    }

    @Test
    void explicitRetryRequeuesFailedCommandsForOneTenantAndChit() {
        ChitLifecycleCommandRepository repository = mock(ChitLifecycleCommandRepository.class);
        UUID chitId = UUID.randomUUID();
        when(repository.retryFailed(any(), any(), any())).thenReturn(1);

        assertThat(new ChitLifecycleCommandStore(repository, mock(JdbcTemplate.class))
                .retryFailed("tenant-a", chitId)).isEqualTo(1);

        verify(repository).retryFailed(any(), any(), any());
    }
}
