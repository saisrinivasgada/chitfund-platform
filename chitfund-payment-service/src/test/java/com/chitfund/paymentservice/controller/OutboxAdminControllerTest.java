package com.chitfund.paymentservice.controller;

import com.chitfund.common.context.TenantContext;
import com.chitfund.common.exception.BusinessException;
import com.chitfund.paymentservice.dto.request.ReplayOutboxRequest;
import com.chitfund.paymentservice.kafka.PaymentOutboxStore;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.core.Authentication;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class OutboxAdminControllerTest {

    private static final String TENANT = "10000000-0000-0000-0000-000000000001";
    private static final UUID ACTOR = UUID.fromString("20000000-0000-0000-0000-000000000002");

    @AfterEach
    void clearTenant() {
        TenantContext.clear();
    }

    @Test
    void replayIsTenantScopedAndRecordsActorAndReason() {
        PaymentOutboxStore store = mock(PaymentOutboxStore.class);
        Authentication authentication = mock(Authentication.class);
        TenantContext.set(TENANT);
        when(authentication.getPrincipal()).thenReturn(ACTOR);
        when(store.replayFailed("delivery-1", TENANT, ACTOR.toString(), "provider recovered"))
                .thenReturn(true);
        ReplayOutboxRequest request = new ReplayOutboxRequest();
        request.setReason("  provider recovered  ");

        var response = new OutboxAdminController(store)
                .replay("delivery-1", request, authentication);

        assertThat(response.getBody()).isNotNull();
        assertThat(response.getBody().isSuccess()).isTrue();
        assertThat(response.getBody().getData()).isEqualTo("delivery-1");
        verify(store).replayFailed(
                "delivery-1", TENANT, ACTOR.toString(), "provider recovered");
    }

    @Test
    void replayCannotCrossTenantOrTargetANonFailedDelivery() {
        PaymentOutboxStore store = mock(PaymentOutboxStore.class);
        Authentication authentication = mock(Authentication.class);
        TenantContext.set(TENANT);
        when(authentication.getPrincipal()).thenReturn(ACTOR);
        ReplayOutboxRequest request = new ReplayOutboxRequest();
        request.setReason("investigated incident");

        assertThatThrownBy(() -> new OutboxAdminController(store)
                .replay("other-tenant-delivery", request, authentication))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("not found");
    }
}
