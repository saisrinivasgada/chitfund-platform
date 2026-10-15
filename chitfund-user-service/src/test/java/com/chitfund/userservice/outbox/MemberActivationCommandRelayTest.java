package com.chitfund.userservice.outbox;

import com.chitfund.userservice.client.MemberServiceClient;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.time.Duration;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class MemberActivationCommandRelayTest {
    private MemberActivationCommandOutbox store;
    private MemberServiceClient memberServiceClient;
    private MemberActivationCommandRelay relay;

    @BeforeEach
    void setUp() {
        store = mock(MemberActivationCommandOutbox.class);
        memberServiceClient = mock(MemberServiceClient.class);
        relay = new MemberActivationCommandRelay(store, memberServiceClient,
                new SimpleMeterRegistry(), 25, 3, Duration.ofSeconds(20));
    }

    @Test
    void executesOutsideClaimTransactionAndFinalizesByLease() {
        MemberActivationCommand command = command(0);
        when(store.claimBatch(25, Duration.ofSeconds(20))).thenReturn(List.of(command));
        when(store.markCompleted(command)).thenReturn(true);
        doAnswer(invocation -> {
            assertThat(TransactionSynchronizationManager.isActualTransactionActive()).isFalse();
            return null;
        }).when(memberServiceClient).activateAppAccess(
                command.tenantId(), command.memberId(), command.userId(), command.requestId());

        relay.drain();

        verify(memberServiceClient).activateAppAccess(
                command.tenantId(), command.memberId(), command.userId(), command.requestId());
        verify(store).markCompleted(command);
    }

    @Test
    void failureIsRetriedAndSecretIsRedacted() {
        MemberActivationCommand command = command(1);
        when(store.claimBatch(25, Duration.ofSeconds(20))).thenReturn(List.of(command));
        doThrow(new IllegalStateException("Authorization=internal-secret endpoint failed"))
                .when(memberServiceClient).activateAppAccess(
                        command.tenantId(), command.memberId(), command.userId(), command.requestId());
        when(store.markFailed(eq(command), eq(3), any(), eq("IllegalStateException"),
                eq("Authorization=[REDACTED] endpoint failed")))
                .thenReturn(new MemberActivationCommandOutbox.FailureResult(true, false, 2));

        relay.drain();

        verify(store, never()).markCompleted(any());
        verify(store).markFailed(eq(command), eq(3), any(), eq("IllegalStateException"),
                eq("Authorization=[REDACTED] endpoint failed"));
    }

    private MemberActivationCommand command(int attempts) {
        return new MemberActivationCommand("delivery-id", UUID.randomUUID(), UUID.randomUUID(),
                UUID.randomUUID(), UUID.randomUUID(), attempts, "lease-token");
    }
}
