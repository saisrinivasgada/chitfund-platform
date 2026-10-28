package com.chitfund.chitservice.service;

import com.chitfund.chitservice.client.NotificationClient;
import com.chitfund.chitservice.domain.entity.ChitLifecycleCommand;
import com.chitfund.chitservice.repository.ChitLifecycleCommandRepository;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.data.domain.Pageable;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ChitLifecycleCommandWorkerTest {

    @Test
    void successfulCloseIsAcknowledgedWithTheClaimToken() {
        ChitLifecycleCommandRepository repository = mock(ChitLifecycleCommandRepository.class);
        ChitLifecycleCommandStore store = mock(ChitLifecycleCommandStore.class);
        NotificationClient client = mock(NotificationClient.class);
        UUID id = UUID.randomUUID();
        UUID token = UUID.randomUUID();
        ChitLifecycleCommand command = command(id, token);
        when(repository.findReadyIds(any(LocalDateTime.class), any(Pageable.class)))
                .thenReturn(List.of(id));
        when(store.claim(id)).thenReturn(Optional.of(command));

        new ChitLifecycleCommandWorker(repository, store, client, new SimpleMeterRegistry(), mock(DrawSkipCoordinator.class))
                .processReady();

        verify(client).closeDrawsForChit(command.getChitId(), command.getTenantId());
        verify(store).complete(id, token);
    }

    @Test
    void paymentServiceFailureIsRetriedInsteadOfAcknowledged() {
        ChitLifecycleCommandRepository repository = mock(ChitLifecycleCommandRepository.class);
        ChitLifecycleCommandStore store = mock(ChitLifecycleCommandStore.class);
        NotificationClient client = mock(NotificationClient.class);
        UUID id = UUID.randomUUID();
        ChitLifecycleCommand command = command(id, UUID.randomUUID());
        when(repository.findReadyIds(any(LocalDateTime.class), any(Pageable.class)))
                .thenReturn(List.of(id));
        when(store.claim(id)).thenReturn(Optional.of(command));
        doThrow(new IllegalStateException("payment unavailable"))
                .when(client).closeDrawsForChit(command.getChitId(), command.getTenantId());

        new ChitLifecycleCommandWorker(repository, store, client, new SimpleMeterRegistry(), mock(DrawSkipCoordinator.class))
                .processReady();

        ArgumentCaptor<Exception> error = ArgumentCaptor.forClass(Exception.class);
        verify(store).fail(eq(id), eq(command.getClaimToken()), error.capture());
        assertThat(error.getValue()).hasMessageContaining("payment unavailable");
    }

    @Test
    void lostPaymentResponseRetriesTheSameDurableEnvelopeBeforeShifting() {
        var repository = mock(ChitLifecycleCommandRepository.class); var store = mock(ChitLifecycleCommandStore.class);
        var client = mock(NotificationClient.class); var skips = mock(DrawSkipCoordinator.class);
        var command = command(UUID.randomUUID(), UUID.randomUUID()); command.setCommandType(DrawSkipCoordinator.SKIP_DRAW);
        var envelope = new com.chitfund.common.dto.DrawSkipCommand(command.getId(), UUID.randomUUID(), "ADMIN", new com.chitfund.common.dto.DrawSkipRequest());
        when(repository.findReadyIds(any(), any())).thenReturn(List.of(command.getId()));
        when(store.claim(command.getId())).thenReturn(Optional.of(command)); when(skips.decode(command)).thenReturn(envelope);
        var result = new com.chitfund.common.dto.DrawSkipResult(command.getId(), "hash", "APPLIED", null);
        when(client.skipDraw(envelope, command.getTenantId())).thenThrow(new IllegalStateException("response lost")).thenReturn(result);
        var worker = new ChitLifecycleCommandWorker(repository, store, client, new SimpleMeterRegistry(), skips);
        worker.processReady(); org.mockito.Mockito.verify(skips, org.mockito.Mockito.never()).complete(any(), any());
        worker.processReady(); org.mockito.Mockito.verify(client, org.mockito.Mockito.times(2)).skipDraw(envelope, command.getTenantId());
        org.mockito.Mockito.verify(skips).complete(command, result);
        org.mockito.Mockito.verify(store).fail(eq(command.getId()), eq(command.getClaimToken()), any());
    }

    private ChitLifecycleCommand command(UUID id, UUID token) {
        return ChitLifecycleCommand.builder()
                .id(id)
                .tenantId(UUID.randomUUID().toString())
                .chitId(UUID.randomUUID())
                .commandType(ChitLifecycleCommandStore.CLOSE_DRAWS)
                .status("PROCESSING")
                .claimToken(token)
                .build();
    }
}
