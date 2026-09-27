package com.chitfund.payoutservice.service;

import com.chitfund.payoutservice.domain.PayoutFinancialCommand;
import com.chitfund.payoutservice.repository.PayoutFinancialCommandRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class PayoutFinancialCommandStoreTest {
    @Mock PayoutFinancialCommandRepository repository;
    @InjectMocks PayoutFinancialCommandStore store;

    @Test
    void deliveryFailureSchedulesAReplayBeforeAttemptTen() {
        PayoutFinancialCommand command = processing(0);
        when(repository.findById(command.getId())).thenReturn(Optional.of(command));

        store.fail(command.getId(), command.getClaimToken(), new IllegalStateException());

        assertThat(command.getStatus()).isEqualTo("RETRY");
        assertThat(command.getAttempts()).isEqualTo(1);
        assertThat(command.getAvailableAt()).isNotNull();
        assertThat(command.getClaimToken()).isNull();
    }

    @Test
    void tenthFailureStopsAutomaticReplayAndRemainsVisible() {
        PayoutFinancialCommand command = processing(9);
        when(repository.findById(command.getId())).thenReturn(Optional.of(command));

        store.fail(command.getId(), command.getClaimToken(), new IllegalStateException());

        assertThat(command.getStatus()).isEqualTo("FAILED");
        assertThat(command.getAttempts()).isEqualTo(10);
        assertThat(command.getLastErrorCode()).isEqualTo("IllegalStateException");
    }

    @Test
    void explicitRetryRequeuesTerminalFailures() {
        UUID payoutId = UUID.randomUUID();
        when(repository.retryFailed(any(), any())).thenReturn(2);

        assertThat(store.retryFailed(payoutId)).isEqualTo(2);
        verify(repository).retryFailed(any(), any());
    }

    private PayoutFinancialCommand processing(int attempts) {
        return PayoutFinancialCommand.builder()
                .id(UUID.randomUUID())
                .payoutId(UUID.randomUUID())
                .status("PROCESSING")
                .attempts(attempts)
                .claimToken(UUID.randomUUID())
                .build();
    }
}
