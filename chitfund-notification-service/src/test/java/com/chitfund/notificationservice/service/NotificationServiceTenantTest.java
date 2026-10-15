package com.chitfund.notificationservice.service;

import com.chitfund.notificationservice.domain.Notification;
import com.chitfund.notificationservice.domain.enums.NotificationEventType;
import com.chitfund.notificationservice.dto.request.NotifyRequest;
import com.chitfund.notificationservice.outbox.NotificationDeliveryQueue;
import com.chitfund.notificationservice.repository.NotificationRepository;
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
import static org.mockito.Mockito.doAnswer;

@ExtendWith(MockitoExtension.class)
class NotificationServiceTenantTest {

    @Mock NotificationRepository repository;
    @Mock NotificationDeliveryQueue deliveryQueue;

    @Test
    void skippedDeliveryStillPersistsTenant() {
        NotificationService service = new NotificationService(repository, deliveryQueue);
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
        NotificationService service = new NotificationService(repository, deliveryQueue);
        UUID recipient = UUID.randomUUID();
        Pageable page = Pageable.ofSize(20);
        when(repository.findByTenantIdAndRecipientIdOrderByCreatedAtDesc("tenant-a", recipient, page))
                .thenReturn(Page.empty());

        service.getHistory("tenant-a", recipient, page);

        verify(repository).findByTenantIdAndRecipientIdOrderByCreatedAtDesc("tenant-a", recipient, page);
    }

    @Test
    void providerDeliveryIsQueuedAndHistoryRemainsPendingUntilRelaySuccess() {
        NotificationService service = new NotificationService(repository, deliveryQueue);
        UUID recipient = UUID.randomUUID();
        UUID notificationId = UUID.randomUUID();
        doAnswer(invocation -> {
            Notification notification = invocation.getArgument(0);
            notification.setId(notificationId);
            return notification;
        }).when(repository).save(org.mockito.ArgumentMatchers.any(Notification.class));
        NotifyRequest request = new NotifyRequest();
        request.setRecipientId(recipient);
        request.setRecipientPhone("+919876543210");
        request.setEventType(NotificationEventType.PAYMENT_DUE);
        request.setTemplateParams(Map.of(
                "amount", "1000", "chitName", "Test Chit",
                "monthNumber", "1", "dueDate", "2026-10-10"));

        var response = service.send("11111111-1111-1111-1111-111111111111",
                "tenant-a", request);

        assertThat(response.getStatus())
                .isEqualTo(com.chitfund.notificationservice.domain.enums.NotificationStatus.PENDING);
        verify(deliveryQueue).enqueueChannel(
                "11111111-1111-1111-1111-111111111111", "tenant-a",
                notificationId, recipient, "+919876543210",
                response.getMessage(), response.getChannel());
    }
}
