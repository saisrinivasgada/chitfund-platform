package com.chitfund.paymentservice.service;

import com.chitfund.common.context.TenantContext;
import com.chitfund.common.exception.BusinessException;
import com.chitfund.paymentservice.domain.Notification;
import com.chitfund.paymentservice.domain.enums.NotificationType;
import com.chitfund.paymentservice.repository.NotificationRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class NotificationServiceTenantTest {

    @Mock NotificationRepository repository;
    @Mock JdbcTemplate jdbc;
    private NotificationService service;

    @BeforeEach
    void setUp() {
        service = new NotificationService(repository, jdbc);
        TenantContext.set("tenant-a");
    }

    @AfterEach
    void clearTenant() {
        TenantContext.clear();
    }

    @Test
    void roleNotificationIsPersistedInsideCurrentTenant() {
        service.notifyRole("ADMIN", NotificationType.PAYMENT_COMPLETED,
                "Title", "Message", null, null, "/payments");

        ArgumentCaptor<Notification> saved = ArgumentCaptor.forClass(Notification.class);
        verify(repository).save(saved.capture());
        assertThat(saved.getValue().getTenantId()).isEqualTo("tenant-a");
        assertThat(saved.getValue().getRecipientRole()).isEqualTo("ADMIN");
    }

    @Test
    void feedAndUnreadQueriesAlwaysCarryTenantScope() {
        UUID userId = UUID.randomUUID();
        when(repository.findLatestForUser("tenant-a", userId.toString(), "ADMIN"))
                .thenReturn(List.of());

        service.getForUser(userId, "ADMIN");
        service.countUnread(userId, "ADMIN");

        verify(repository).findLatestForUser("tenant-a", userId.toString(), "ADMIN");
        verify(repository).countUnread("tenant-a", userId.toString(), "ADMIN");
    }

    @Test
    void markReadCannotAcknowledgeAnotherTenantNotification() {
        UUID notificationId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        when(repository.findByIdAndTenantId(notificationId, "tenant-a"))
                .thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.markRead(notificationId, userId, "ADMIN"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("not found");

        verifyNoInteractions(jdbc);
    }

    @Test
    void markReadCannotAcknowledgeNotificationForAnotherAudience() {
        UUID notificationId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        Notification notification = Notification.builder()
                .id(notificationId).tenantId("tenant-a")
                .recipientUserId(UUID.randomUUID()).recipientRole("MANAGER")
                .type(NotificationType.PAYMENT_COMPLETED)
                .title("Title").message("Message").build();
        when(repository.findByIdAndTenantId(notificationId, "tenant-a"))
                .thenReturn(Optional.of(notification));

        assertThatThrownBy(() -> service.markRead(notificationId, userId, "ADMIN"))
                .isInstanceOf(BusinessException.class);
        verifyNoInteractions(jdbc);
    }
}
