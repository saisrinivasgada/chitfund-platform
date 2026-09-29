package com.chitfund.chitservice.client;

import com.chitfund.common.context.TenantContext;
import com.chitfund.common.event.SqsQueues;
import com.chitfund.common.outbox.DurableEventOutbox;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.client.RestTemplate;
import org.springframework.http.HttpEntity;

import java.util.List;

import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;
import static org.assertj.core.api.Assertions.assertThat;

class NotificationClientAfterCommitTest {

    private final RestTemplate restTemplate = mock(RestTemplate.class);
    private final DurableEventOutbox eventOutbox = mock(DurableEventOutbox.class);
    private final NotificationClient client = new NotificationClient(
            restTemplate, eventOutbox, new ObjectMapper());

    @AfterEach
    void clearTransactionState() {
        TenantContext.clear();
    }

    @Test
    void notificationIsPersistedImmediatelyForTheBusinessTransaction() {
        TenantContext.set("tenant-a");

        client.notifyUsersInAppDurably(
                List.of("member-1"), "TYPE", "Title", "Message", "/target");

        verify(eventOutbox).enqueue(anyString(),
                eq(SqsQueues.EVT_BULK_IN_APP_BY_MEMBER_IDS),
                anyString(), eq(SqsQueues.NOTIFICATION_EVENTS));
    }

    @Test
    void persistenceFailureIsNotSilentlyIgnored() {
        TenantContext.set("tenant-a");
        doThrow(new IllegalStateException("database unavailable")).when(eventOutbox)
                .enqueue(anyString(), anyString(), anyString(), anyString());

        org.assertj.core.api.Assertions.assertThatThrownBy(() -> client.notifyUsersInAppDurably(
                        List.of("member-1"), "TYPE", "Title", "Message", "/target"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("Could not persist");
    }

    @Test
    void legacyBulkNotificationCarriesExplicitTenantHeader() {
        client.sendBulk("tenant-a", List.of(java.util.Map.of(
                "recipientRole", "MANAGER", "type", "GENERAL",
                "title", "Title", "message", "Message")));

        @SuppressWarnings("rawtypes")
        var request = org.mockito.ArgumentCaptor.forClass(HttpEntity.class);
        verify(restTemplate).postForObject(
                anyString(), request.capture(), eq(Void.class));
        assertThat(request.getValue().getHeaders().getFirst("X-Tenant-ID"))
                .isEqualTo("tenant-a");
    }
}
