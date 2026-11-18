package com.chitfund.notificationservice.controller;

import com.chitfund.notificationservice.service.PushTokenService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.Map;
import java.util.UUID;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

class PushTokenControllerUnregisterTest {

    @AfterEach
    void clearContext() {
        SecurityContextHolder.clearContext();
    }

    private void authenticateAs(UUID userId) {
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(userId, null, java.util.List.of()));
    }

    @Test
    void unregisterScopesDeletionToAuthenticatedUser() {
        PushTokenService service = mock(PushTokenService.class);
        PushTokenController controller = new PushTokenController(service);
        UUID userA = UUID.randomUUID();
        authenticateAs(userA);
        String token = "ExponentPushToken[abc123]";

        controller.unregister(Map.of("token", token));

        // Delete must carry the caller's identity, not the token alone.
        verify(service).unregister(userA, token);
    }

    @Test
    void blankTokenIsANoOp() {
        PushTokenService service = mock(PushTokenService.class);
        PushTokenController controller = new PushTokenController(service);
        authenticateAs(UUID.randomUUID());

        controller.unregister(Map.of("token", "   "));

        verify(service, never()).unregister(org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.any());
    }
}
