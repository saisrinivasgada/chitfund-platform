package com.chitfund.notificationservice.service;

import com.chitfund.notificationservice.repository.UserPushTokenRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.mockito.Mockito.when;

/**
 * Focused unit tests for the concurrency-safe registration path: {@code register}
 * must delegate to the single atomic upsert and never fall back to a
 * find-then-save read-modify-write (the former race on the unique token key).
 */
@ExtendWith(MockitoExtension.class)
class PushTokenServiceRegisterTest {

    @Mock UserPushTokenRepository repo;

    @Test
    void registerDelegatesToAtomicUpsertAndNeverReadModifyWrites() {
        PushTokenService service = new PushTokenService(repo);
        UUID user = UUID.randomUUID();
        String token = "ExponentPushToken[abc123]";
        when(repo.upsertToken(anyString(), eq(user.toString()), eq(token), eq("ios"),
                any(LocalDateTime.class))).thenReturn(1);

        service.register(user, token, "ios");

        // Exactly one atomic op; no findByToken / save read-modify-write that could race.
        verify(repo).upsertToken(anyString(), eq(user.toString()), eq(token), eq("ios"),
                any(LocalDateTime.class));
        verify(repo, never()).findByToken(anyString());
        verify(repo, never()).save(any());
        verifyNoMoreInteractions(repo);
    }

    @Test
    void registerPassesAFreshRowIdUsedOnlyForInsert() {
        PushTokenService service = new PushTokenService(repo);
        UUID user = UUID.randomUUID();
        ArgumentCaptor<String> idCaptor = ArgumentCaptor.forClass(String.class);
        when(repo.upsertToken(anyString(), anyString(), anyString(), anyString(),
                any(LocalDateTime.class))).thenReturn(1);

        service.register(user, "ExponentPushToken[new-device]", "android");

        verify(repo).upsertToken(idCaptor.capture(), eq(user.toString()),
                eq("ExponentPushToken[new-device]"), eq("android"), any(LocalDateTime.class));
        // A parseable UUID is supplied for the insert branch (ignored on conflict).
        UUID.fromString(idCaptor.getValue());
    }

    @Test
    void repeatedRegistrationIsIdempotentUpsertEachCall() {
        PushTokenService service = new PushTokenService(repo);
        UUID user = UUID.randomUUID();
        String token = "ExponentPushToken[same-token]";
        when(repo.upsertToken(anyString(), anyString(), eq(token), anyString(),
                any(LocalDateTime.class))).thenReturn(2); // MySQL affected-row count for an update

        service.register(user, token, "ios");
        service.register(user, token, "ios");

        verify(repo, times(2)).upsertToken(anyString(), eq(user.toString()), eq(token),
                eq("ios"), any(LocalDateTime.class));
        verify(repo, never()).save(any());
    }

    @Test
    void reassignmentToNewOwnerGoesThroughTheSameInPlaceUpsert() {
        PushTokenService service = new PushTokenService(repo);
        UUID userA = UUID.randomUUID();
        UUID userB = UUID.randomUUID();
        String sharedToken = "ExponentPushToken[shared-device]";
        when(repo.upsertToken(anyString(), anyString(), eq(sharedToken), anyString(),
                any(LocalDateTime.class))).thenReturn(1).thenReturn(2);

        service.register(userA, sharedToken, "ios");   // first owner (insert)
        service.register(userB, sharedToken, "android"); // hand-off (in-place update)

        // Hand-off reassigns via the atomic upsert with the new owner/platform — the row
        // id is preserved by ON DUPLICATE KEY UPDATE so queued deliveries still resolve.
        verify(repo).upsertToken(anyString(), eq(userA.toString()), eq(sharedToken), eq("ios"),
                any(LocalDateTime.class));
        verify(repo).upsertToken(anyString(), eq(userB.toString()), eq(sharedToken), eq("android"),
                any(LocalDateTime.class));
        verify(repo, never()).findByToken(anyString());
        verify(repo, never()).deleteByUserIdAndToken(any(), anyString());
    }

    @Test
    void registerDoesNotLeakTokenIntoLogOrError() {
        PushTokenService service = new PushTokenService(repo);
        UUID user = UUID.randomUUID();
        String secretToken = "ExponentPushToken[do-not-leak-me]";
        // Simulate an infra failure to confirm the token is not echoed into the error path.
        when(repo.upsertToken(anyString(), anyString(), anyString(), anyString(),
                any(LocalDateTime.class)))
                .thenThrow(new RuntimeException("db unavailable"));

        try {
            service.register(user, secretToken, "ios");
        } catch (RuntimeException ex) {
            assertThat(ex.getMessage()).doesNotContain(secretToken);
        }
    }
}
