package com.chitfund.payoutservice.controller;

import com.chitfund.common.context.TenantContext;
import com.chitfund.common.exception.BusinessException;
import com.chitfund.payoutservice.dto.request.ReplayOutboxRequest;
import com.chitfund.payoutservice.kafka.PayoutOutboxStore;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class OutboxAdminControllerTest {

    private static final String TENANT = "tenant-a";
    private static final UUID ACTOR = UUID.fromString("00000000-0000-0000-0000-0000000000aa");

    @AfterEach
    void clearTenant() {
        TenantContext.clear();
    }

    @Test
    void replaysOnlyWithinTheAuthenticatedTenantAndRecordsTheReason() {
        PayoutOutboxStore store = mock(PayoutOutboxStore.class);
        TenantContext.set(TENANT);
        when(store.replayFailed("delivery-1", TENANT, ACTOR.toString(), "provider recovered"))
                .thenReturn(true);
        ReplayOutboxRequest request = new ReplayOutboxRequest();
        request.setReason("  provider recovered  ");

        var response = new OutboxAdminController(store).replay(
                "delivery-1", request,
                new UsernamePasswordAuthenticationToken(ACTOR, null));

        assertThat(response.getStatusCode().is2xxSuccessful()).isTrue();
        verify(store).replayFailed(
                "delivery-1", TENANT, ACTOR.toString(), "provider recovered");
    }

    @Test
    void hidesFailedDeliveriesBelongingToAnotherTenant() {
        PayoutOutboxStore store = mock(PayoutOutboxStore.class);
        TenantContext.set(TENANT);
        ReplayOutboxRequest request = new ReplayOutboxRequest();
        request.setReason("investigate delivery");

        assertThatThrownBy(() -> new OutboxAdminController(store).replay(
                "other-tenant-delivery", request,
                new UsernamePasswordAuthenticationToken(ACTOR, null)))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("not found");

        verify(store).replayFailed(
                "other-tenant-delivery", TENANT, ACTOR.toString(), "investigate delivery");
    }
}
