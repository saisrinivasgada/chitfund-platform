package com.chitfund.userservice.service;

import com.chitfund.userservice.event.NotificationEventPublisher;
import com.chitfund.userservice.outbox.MemberActivationCommandOutbox;
import com.chitfund.userservice.repository.UserRepository;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class IdentityNotificationListenerTest {
    private final NotificationEventPublisher notifications = mock(NotificationEventPublisher.class);
    private final MemberActivationCommandOutbox activations = mock(MemberActivationCommandOutbox.class);
    private final UserRepository users = mock(UserRepository.class);
    private final IdentityNotificationListener listener =
            new IdentityNotificationListener(notifications, activations, users);

    @Test
    void activationPersistsCommandAndMemberNotificationSynchronously() {
        UUID userId = UUID.randomUUID();
        UUID requestId = UUID.randomUUID();
        UUID tenantId = UUID.randomUUID();
        UUID memberId = UUID.randomUUID();
        when(users.findById(userId)).thenReturn(Optional.empty());

        listener.onIdentityNotification(new IdentityNotificationEvent(
                IdentityNotificationEvent.Type.CHITFUND_ACCESS_ACTIVATED,
                userId, requestId, tenantId, "Example Chitfund", List.of(),
                tenantId, memberId, null));

        verify(activations).enqueue(requestId, tenantId, memberId, userId);
        verify(notifications).publishInApp(
                org.mockito.ArgumentMatchers.eq(tenantId.toString()),
                org.mockito.ArgumentMatchers.eq(userId), anyString(), anyString(),
                org.mockito.ArgumentMatchers.eq("CHITFUND_REQUEST"), any(), anyString());
    }
}
