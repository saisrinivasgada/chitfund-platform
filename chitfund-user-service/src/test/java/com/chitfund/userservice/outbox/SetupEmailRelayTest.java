package com.chitfund.userservice.outbox;

import com.chitfund.userservice.service.AuthService;
import com.chitfund.userservice.service.EmailService;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class SetupEmailRelayTest {
    @Mock SetupEmailOutbox store;
    @Mock AuthService authService;
    @Mock EmailService emailService;
    SetupEmailRelay relay;

    @BeforeEach
    void setUp() {
        relay = new SetupEmailRelay(store, authService, emailService,
                new SimpleMeterRegistry(), "https://app.thechitwise.com", 50, 5,
                java.time.Duration.ofSeconds(30));
    }

    @Test
    void successPath_sendsEmailAndMarksCompletedAndDelivered() {
        UUID requestId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        String leaseToken = UUID.randomUUID().toString();
        SetupEmailCommand cmd = new SetupEmailCommand(
                UUID.randomUUID().toString(), requestId, userId,
                "m@example.com", "Alice", "AcmeCo", 0, leaseToken);

        when(authService.generateSetupToken(userId, requestId)).thenReturn("raw-token-abc");
        when(store.markCompletedAndDelivered(cmd)).thenReturn(true);

        relay.execute(cmd);

        verify(emailService).sendFirstTimeSetupEmail(
                eq("m@example.com"), eq("Alice"),
                contains("https://app.thechitwise.com/setup?token="),
                eq("AcmeCo"));
        verify(store).markCompletedAndDelivered(cmd);
        verify(store, never()).markCompleted(any());
    }

    @Test
    void setupLinkContainsRawToken() {
        UUID requestId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        SetupEmailCommand cmd = new SetupEmailCommand(
                UUID.randomUUID().toString(), requestId, userId,
                "m@example.com", "Bob", "OrgX", 0, "lease");

        when(authService.generateSetupToken(userId, requestId)).thenReturn("tok123");
        when(store.markCompletedAndDelivered(any())).thenReturn(true);

        relay.execute(cmd);

        verify(emailService).sendFirstTimeSetupEmail(any(), any(),
                eq("https://app.thechitwise.com/setup?token=tok123"), any());
    }

    @Test
    void emailFailure_nonTerminal_schedulesRetry() {
        UUID requestId = UUID.randomUUID();
        SetupEmailCommand cmd = new SetupEmailCommand(
                UUID.randomUUID().toString(), requestId, UUID.randomUUID(),
                "m@example.com", "Carol", "OrgY", 1, "lease");

        when(authService.generateSetupToken(any(), any())).thenReturn("tok");
        doThrow(new RuntimeException("SES throttle")).when(emailService).sendFirstTimeSetupEmail(
                any(), any(), any(), any());
        when(store.markFailed(any(), anyInt(), any(), any(), any()))
                .thenReturn(new SetupEmailOutbox.FailureResult(true, false, 2));

        relay.execute(cmd);

        // attempts=1, nextAttempts=2, maxAttempts=5 → not terminal → markFailed
        verify(store).markFailed(eq(cmd), eq(5), any(), eq("RuntimeException"), contains("SES throttle"));
        verify(store, never()).markTerminalFailure(any(), anyInt(), any(), any(), any());
        verify(store, never()).markCompletedAndDelivered(any());
    }

    @Test
    void terminalFailure_callsMarkTerminalFailure() {
        UUID requestId = UUID.randomUUID();
        // attempts=4, nextAttempts=5, maxAttempts=5 → terminal
        SetupEmailCommand cmd = new SetupEmailCommand(
                UUID.randomUUID().toString(), requestId, UUID.randomUUID(),
                "m@example.com", "Dave", "OrgZ", 4, "lease");

        when(authService.generateSetupToken(any(), any())).thenReturn("tok");
        doThrow(new RuntimeException("permanent error")).when(emailService).sendFirstTimeSetupEmail(
                any(), any(), any(), any());
        when(store.markTerminalFailure(any(), anyInt(), any(), any(), any())).thenReturn(true);

        relay.execute(cmd);

        verify(store).markTerminalFailure(eq(cmd), eq(5), any(), eq("RuntimeException"), contains("permanent error"));
        verify(store, never()).markFailed(any(), anyInt(), any(), any(), any());
    }

    @Test
    void sanitize_redactsTokenAndSetupLink() {
        String sanitized = SetupEmailRelay.sanitize(
                "setup-link=https://app.test/setup?token=abc123 password=secret extra");
        assertThat(sanitized).doesNotContain("abc123");
        assertThat(sanitized).doesNotContain("secret");
        assertThat(sanitized).contains("[REDACTED]");
    }
}
