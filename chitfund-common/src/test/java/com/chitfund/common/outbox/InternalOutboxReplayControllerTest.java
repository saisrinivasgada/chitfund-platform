package com.chitfund.common.outbox;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class InternalOutboxReplayControllerTest {

    @Test
    void rejectsReplayWithoutTheInternalCredential() {
        DurableAuditOutbox audit = mock(DurableAuditOutbox.class);
        DurableEventOutbox domain = mock(DurableEventOutbox.class);
        var controller = new InternalOutboxReplayController(audit, domain, "secret-key");

        var response = controller.replay(null, null, "operator-1", "audit",
                UUID.randomUUID().toString(),
                new InternalOutboxReplayController.ReplayRequest("incident recovered"));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        verify(audit, never()).replayFailed(
                org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.any());
    }

    @Test
    void replayPreservesOperatorAndMandatoryReason() {
        DurableAuditOutbox audit = mock(DurableAuditOutbox.class);
        DurableEventOutbox domain = mock(DurableEventOutbox.class);
        var controller = new InternalOutboxReplayController(audit, domain, "secret-key");
        String deliveryId = UUID.randomUUID().toString();
        when(audit.replayFailed(deliveryId, "operator-1", "INC-123 provider recovered"))
                .thenReturn(true);

        var response = controller.replay("secret-key", null, " operator-1 ", "audit",
                deliveryId, new InternalOutboxReplayController.ReplayRequest(
                        " INC-123 provider recovered "));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        verify(audit).replayFailed(deliveryId, "operator-1", "INC-123 provider recovered");
    }

    @Test
    void missingReasonAndUnknownDeliveryFailSafely() {
        DurableAuditOutbox audit = mock(DurableAuditOutbox.class);
        DurableEventOutbox domain = mock(DurableEventOutbox.class);
        var controller = new InternalOutboxReplayController(audit, domain, "secret-key");
        String deliveryId = UUID.randomUUID().toString();

        assertThat(controller.replay("secret-key", null, "operator-1", "domain",
                deliveryId, new InternalOutboxReplayController.ReplayRequest(" "))
                .getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(controller.replay("secret-key", null, "operator-1", "domain",
                deliveryId, new InternalOutboxReplayController.ReplayRequest("retry"))
                .getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
    }
}
