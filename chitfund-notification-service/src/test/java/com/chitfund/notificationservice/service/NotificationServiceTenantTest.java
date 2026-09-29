package com.chitfund.notificationservice.service;

import com.chitfund.notificationservice.domain.Notification;
import com.chitfund.notificationservice.domain.enums.NotificationEventType;
import com.chitfund.notificationservice.dto.request.NotifyRequest;
import com.chitfund.notificationservice.repository.NotificationRepository;
import com.chitfund.notificationservice.sender.NotificationSender;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class NotificationServiceTenantTest {

    @Mock NotificationRepository repository;
    @Mock NotificationSender sender;

    @Test
    void skippedDeliveryStillPersistsTenant() {
        NotificationService service = new NotificationService(repository, sender);
        NotifyRequest request = new NotifyRequest();
        request.setRecipientId(UUID.randomUUID());
        request.setEventType(NotificationEventType.PAYMENT_DUE);
        request.setTemplateParams(Map.of());

        service.send("tenant-a", request);

        ArgumentCaptor<Notification> saved = ArgumentCaptor.forClass(Notification.class);
        verify(repository).save(saved.capture());
        assertThat(saved.getValue().getTenantId()).isEqualTo("tenant-a");
    }

    @Test
    void adminHistoryQueryIsTenantScoped() {
        NotificationService service = new NotificationService(repository, sender);
        UUID recipient = UUID.randomUUID();
        Pageable page = Pageable.ofSize(20);
        when(repository.findByTenantIdAndRecipientIdOrderByCreatedAtDesc("tenant-a", recipient, page))
                .thenReturn(Page.empty());

        service.getHistory("tenant-a", recipient, page);

        verify(repository).findByTenantIdAndRecipientIdOrderByCreatedAtDesc("tenant-a", recipient, page);
    }
}
