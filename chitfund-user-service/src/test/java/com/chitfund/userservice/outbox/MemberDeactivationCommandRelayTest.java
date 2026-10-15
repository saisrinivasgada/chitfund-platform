package com.chitfund.userservice.outbox;

import com.chitfund.userservice.client.MemberServiceClient;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.util.List;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

class MemberDeactivationCommandRelayTest {
    private MemberDeactivationCommandOutbox store;
    private MemberServiceClient memberServiceClient;
    private MemberDeactivationCommandRelay relay;

    @BeforeEach
    void setUp() {
        store = mock(MemberDeactivationCommandOutbox.class);
        memberServiceClient = mock(MemberServiceClient.class);
        relay = new MemberDeactivationCommandRelay(store, memberServiceClient,
                new SimpleMeterRegistry(), 25, 3, Duration.ofSeconds(20));
    }

    @Test
    void executesRevokeAndFinalizesCompletion() {
        MemberDeactivationCommand command = command(0);
        when(store.claimBatch(25, Duration.ofSeconds(20))).thenReturn(List.of(command));
        when(store.markCompleted(command)).thenReturn(true);

        relay.drain();

        verify(memberServiceClient).revokeAppAccess(command.tenantId(), command.memberId());
        verify(store).markCompleted(command);
        verify(store, never()).markFailed(any(), anyInt(), any(), any(), any());
    }

    @Test
    void failureIsRetriedAndSecretIsRedacted() {
        MemberDeactivationCommand command = command(1);
        when(store.claimBatch(25, Duration.ofSeconds(20))).thenReturn(List.of(command));
        doThrow(new IllegalStateException("Authorization=internal-secret endpoint failed"))
                .when(memberServiceClient).revokeAppAccess(command.tenantId(), command.memberId());
        when(store.markFailed(eq(command), eq(3), any(), eq("IllegalStateException"),
                eq("Authorization=[REDACTED] endpoint failed")))
                .thenReturn(new MemberDeactivationCommandOutbox.FailureResult(true, false, 2));

        relay.drain();

        verify(store, never()).markCompleted(any());
        verify(store).markFailed(eq(command), eq(3), any(), eq("IllegalStateException"),
                eq("Authorization=[REDACTED] endpoint failed"));
    }

    @Test
    void terminalFailureAfterMaxAttemptsIsLogged() {
        MemberDeactivationCommand command = command(2);
        when(store.claimBatch(25, Duration.ofSeconds(20))).thenReturn(List.of(command));
        doThrow(new IllegalStateException("service down"))
                .when(memberServiceClient).revokeAppAccess(command.tenantId(), command.memberId());
        when(store.markFailed(eq(command), eq(3), any(), any(), any()))
                .thenReturn(new MemberDeactivationCommandOutbox.FailureResult(true, true, 3));

        relay.drain();

        verify(store).markFailed(eq(command), eq(3), any(), any(), any());
        verify(store, never()).markCompleted(any());
    }

    @Test
    void staleFinalizationHandledGracefully() {
        MemberDeactivationCommand command = command(0);
        when(store.claimBatch(25, Duration.ofSeconds(20))).thenReturn(List.of(command));
        when(store.markCompleted(command)).thenReturn(false);

        relay.drain();

        verify(memberServiceClient).revokeAppAccess(command.tenantId(), command.memberId());
        verify(store).markCompleted(command);
    }

    @Test
    void sanitizeRedactsTokenInErrorMessage() {
        String redacted = MemberDeactivationCommandRelay.sanitize("token=supersecret rest of msg");
        org.assertj.core.api.Assertions.assertThat(redacted).contains("[REDACTED]").doesNotContain("supersecret");
    }

    private MemberDeactivationCommand command(int attempts) {
        return new MemberDeactivationCommand("delivery-id", UUID.randomUUID(), UUID.randomUUID(),
                UUID.randomUUID(), UUID.randomUUID(), attempts, "lease-token");
    }
}
