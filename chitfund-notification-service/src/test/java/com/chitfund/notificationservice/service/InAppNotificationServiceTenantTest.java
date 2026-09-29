package com.chitfund.notificationservice.service;

import com.chitfund.common.context.TenantContext;
import com.chitfund.notificationservice.domain.InAppNotification;
import com.chitfund.notificationservice.repository.InAppNotificationRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class InAppNotificationServiceTenantTest {

    @Mock InAppNotificationRepository repository;
    @Mock ExpoPushService pushService;
    private InAppNotificationService service;

    @BeforeEach
    void setUp() {
        service = new InAppNotificationService(repository, new ObjectMapper(), pushService);
        TenantContext.set("tenant-a");
    }

    @AfterEach
    void clearTenant() {
        TenantContext.clear();
    }

    @Test
    void createPersistsExplicitTenant() {
        UUID recipient = UUID.randomUUID();
        service.create("tenant-a", recipient, "Title", "Message", "GENERAL", Map.of(), "/home");

        ArgumentCaptor<InAppNotification> saved = ArgumentCaptor.forClass(InAppNotification.class);
        verify(repository).save(saved.capture());
        assertThat(saved.getValue().getTenantId()).isEqualTo("tenant-a");
        verify(pushService).sendToUser(recipient, "Title", "Message");
    }

    @Test
    void feedAndUnreadCountUseActiveTenant() {
        UUID recipient = UUID.randomUUID();
        when(repository.findVisibleForRecipient(any(), any(), any())).thenReturn(Page.empty());

        service.getForUser(recipient, 0, 30);
        service.getUnreadCount(recipient);

        verify(repository).findVisibleForRecipient("tenant-a", recipient, Pageable.ofSize(30));
        verify(repository).countUnreadVisibleForRecipient("tenant-a", recipient);
    }

    @Test
    void markReadCannotLoadAnInvisibleNotification() {
        UUID recipient = UUID.randomUUID();
        UUID notification = UUID.randomUUID();
        when(repository.findVisibleById(notification, "tenant-a", recipient))
                .thenReturn(Optional.empty());

        service.markRead(notification, recipient);

        verify(repository, never()).save(any());
    }

    @Test
    void ordinaryNotificationCannotFallBackToGlobalScope() {
        assertThatThrownBy(() -> service.create(null, UUID.randomUUID(),
                "Title", "Message", "PAYMENT_RECEIVED", Map.of(), "/payments"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("tenantId");
        verify(repository, never()).save(any());
    }
}
