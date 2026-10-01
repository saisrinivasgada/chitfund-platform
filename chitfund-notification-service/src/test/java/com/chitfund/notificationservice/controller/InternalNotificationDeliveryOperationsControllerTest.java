package com.chitfund.notificationservice.controller;

import com.chitfund.notificationservice.outbox.NotificationDeliveryOutbox;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class InternalNotificationDeliveryOperationsControllerTest {

    @Test
    void rejectsReplayWithoutInternalCredential() {
        NotificationDeliveryOutbox outbox = mock(NotificationDeliveryOutbox.class);
        var controller = new InternalNotificationDeliveryOperationsController(outbox, "secret-key");

        var response = controller.replay(null, "operator-1", UUID.randomUUID().toString(),
                new InternalNotificationDeliveryOperationsController.ReplayRequest("provider recovered"));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        verify(outbox, never()).replayFailed(
                org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.any());
    }

    @Test
    void requeuesFailedDeliveryWithActorAndMandatoryReason() {
        NotificationDeliveryOutbox outbox = mock(NotificationDeliveryOutbox.class);
        var controller = new InternalNotificationDeliveryOperationsController(outbox, "secret-key");
        String deliveryId = UUID.randomUUID().toString();
        when(outbox.replayFailed(deliveryId, "operator-1", "INC-123 provider recovered"))
                .thenReturn(true);

        var response = controller.replay("secret-key", " operator-1 ", deliveryId,
                new InternalNotificationDeliveryOperationsController.ReplayRequest(
                        " INC-123 provider recovered "));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        verify(outbox).replayFailed(deliveryId, "operator-1", "INC-123 provider recovered");
    }

    @Test
    void missingReasonAndNonFailedDeliveryFailSafely() {
        NotificationDeliveryOutbox outbox = mock(NotificationDeliveryOutbox.class);
        var controller = new InternalNotificationDeliveryOperationsController(outbox, "secret-key");
        String deliveryId = UUID.randomUUID().toString();

        assertThat(controller.replay("secret-key", "operator-1", deliveryId,
                new InternalNotificationDeliveryOperationsController.ReplayRequest(" "))
                .getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(controller.replay("secret-key", "operator-1", deliveryId,
                new InternalNotificationDeliveryOperationsController.ReplayRequest("retry"))
                .getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
    }
}
