package com.chitfund.notificationservice.websocket;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.messaging.simp.SimpMessagingTemplate;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class WebSocketBroadcasterTest {

    @Test
    void publishesOnlyToTenantScopedDestination() {
        SimpMessagingTemplate template = mock(SimpMessagingTemplate.class);
        WebSocketBroadcaster broadcaster = new WebSocketBroadcaster(template);

        broadcaster.broadcast("tenant-a", "PAYMENTS_UPDATED", Map.of("chitId", "chit-a"));

        ArgumentCaptor<Object> payload = ArgumentCaptor.forClass(Object.class);
        verify(template).convertAndSend(eq("/topic/data-update/tenant-a"), payload.capture());
        Map<?, ?> message = (Map<?, ?>) payload.getValue();
        assertThat(message.get("type")).isEqualTo("PAYMENTS_UPDATED");
        assertThat(message.get("chitId")).isEqualTo("chit-a");
    }

    @Test
    void refusesUnscopedBroadcast() {
        WebSocketBroadcaster broadcaster = new WebSocketBroadcaster(mock(SimpMessagingTemplate.class));

        assertThatThrownBy(() -> broadcaster.broadcast("", "IN_APP_UPDATED"))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
