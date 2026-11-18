package com.chitfund.notificationservice.service;

import com.chitfund.notificationservice.repository.UserPushTokenRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.UUID;

import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class PushTokenServiceUnregisterTest {

    @Mock UserPushTokenRepository repo;

    @Test
    void unregisterDeletesOnlyOwnTokenScopedToUser() {
        PushTokenService service = new PushTokenService(repo);
        UUID userA = UUID.randomUUID();
        String token = "ExponentPushToken[abc123]";
        when(repo.deleteByUserIdAndToken(userA, token)).thenReturn(1);

        service.unregister(userA, token);

        verify(repo).deleteByUserIdAndToken(userA, token);
        verifyNoMoreInteractions(repo);
    }

    @Test
    void delayedLogoutForUserAdoesNotDeleteTokenReassignedToUserB() {
        PushTokenService service = new PushTokenService(repo);
        UUID userA = UUID.randomUUID();
        String token = "ExponentPushToken[shared-device]";
        // Token was re-assigned to user B, so the user-A-scoped delete removes nothing.
        when(repo.deleteByUserIdAndToken(userA, token)).thenReturn(0);

        service.unregister(userA, token);

        verify(repo).deleteByUserIdAndToken(userA, token);
        verifyNoMoreInteractions(repo);
    }

    @Test
    void unregisterIsIdempotentNoOpOnRetry() {
        PushTokenService service = new PushTokenService(repo);
        UUID userA = UUID.randomUUID();
        String token = "ExponentPushToken[already-gone]";
        when(repo.deleteByUserIdAndToken(userA, token)).thenReturn(0);

        // Retried logout call — still a safe no-op, no exception.
        service.unregister(userA, token);
        service.unregister(userA, token);

        verify(repo, org.mockito.Mockito.times(2)).deleteByUserIdAndToken(userA, token);
    }
}
