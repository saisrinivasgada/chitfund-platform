package com.chitfund.payoutservice.service;

import com.chitfund.payoutservice.client.PaymentServiceClient;
import com.chitfund.payoutservice.domain.PayoutFinancialCommand;
import com.chitfund.payoutservice.domain.enums.PayoutFinancialCommandType;
import com.chitfund.payoutservice.repository.PayoutFinancialCommandRepository;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Pageable;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class PayoutFinancialCommandWorkerTest {
    @Mock PayoutFinancialCommandRepository repository;
    @Mock PayoutFinancialCommandStore store;
    @Mock PaymentServiceClient client;
    private PayoutFinancialCommandWorker worker;

    @BeforeEach
    void setUp() {
        worker = new PayoutFinancialCommandWorker(
                repository, store, client, new SimpleMeterRegistry());
    }

    @Test
    void completesAClaimOnlyAfterPaymentServiceAcknowledgesIt() {
        PayoutFinancialCommand command = command();
        when(repository.findReadyIds(any(LocalDateTime.class), any(Pageable.class)))
                .thenReturn(List.of(command.getId()));
        when(store.claim(command.getId())).thenReturn(Optional.of(command));

        worker.processReady();

        verify(client).execute(command);
        verify(store).complete(command.getId(), command.getClaimToken());
        verify(store, never()).fail(any(), any(), any());
    }

    @Test
    void failedDeliveryRemainsRetryable() {
        PayoutFinancialCommand command = command();
        when(repository.findReadyIds(any(LocalDateTime.class), any(Pageable.class)))
                .thenReturn(List.of(command.getId()));
        when(store.claim(command.getId())).thenReturn(Optional.of(command));
        RuntimeException failure = new RuntimeException("unavailable");
        doThrow(failure).when(client).execute(command);

        worker.processReady();

        verify(store).fail(command.getId(), command.getClaimToken(), failure);
        verify(store, never()).complete(any(), any());
    }

    private PayoutFinancialCommand command() {
        return PayoutFinancialCommand.builder()
                .id(UUID.randomUUID())
                .payoutId(UUID.randomUUID())
                .tenantId("tenant-a")
                .actorId(UUID.randomUUID())
                .sequenceNo(1)
                .dedupeKey(UUID.randomUUID().toString())
                .commandType(PayoutFinancialCommandType.REVERT_DEDUCTIONS)
                .status("PROCESSING")
                .attempts(0)
                .availableAt(LocalDateTime.now())
                .claimToken(UUID.randomUUID())
                .createdAt(LocalDateTime.now())
                .build();
    }
}
