package com.chitfund.paymentservice.controller;

import com.chitfund.common.context.TenantContext;
import com.chitfund.paymentservice.client.UserServiceClient;
import com.chitfund.paymentservice.dto.request.SettlementPreviewRequest;
import com.chitfund.paymentservice.service.SettlementService;
import com.chitfund.paymentservice.service.SettlementTransactionService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.verify;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

class SettlementControllerCapabilityTest {

    private final SettlementService settlementService = mock(SettlementService.class);
    private final SettlementTransactionService transactionService = mock(SettlementTransactionService.class);
    private final UserServiceClient userServiceClient = mock(UserServiceClient.class);
    private final SettlementController controller =
            new SettlementController(settlementService, transactionService, userServiceClient);

    @AfterEach
    void clearTenant() {
        TenantContext.clear();
    }

    @Test
    void missingTenantCannotBypassSettlementCapability() {
        assertEquals(HttpStatus.FORBIDDEN, controller.preview(request()).getStatusCode());
        verifyNoInteractions(settlementService, transactionService, userServiceClient);
    }

    @Test
    void unverifiedCapabilitiesCannotBypassSettlementCapability() {
        TenantContext.set("tenant-a");
        when(userServiceClient.getTenantCapabilities("tenant-a")).thenReturn(null);

        assertEquals(HttpStatus.FORBIDDEN, controller.preview(request()).getStatusCode());
        verifyNoInteractions(settlementService, transactionService);
    }

    @Test
    void capabilityLookupExceptionCannotBypassSettlementCapability() {
        TenantContext.set("tenant-a");
        when(userServiceClient.getTenantCapabilities("tenant-a"))
                .thenThrow(new IllegalStateException("user-service unavailable"));

        assertEquals(HttpStatus.FORBIDDEN, controller.preview(request()).getStatusCode());
        verifyNoInteractions(settlementService, transactionService);
    }

    @Test
    void downgradeStillAllowsExistingSettlementHistoryToRemainVisible() {
        TenantContext.set("tenant-a");
        UUID memberId = UUID.randomUUID();
        when(settlementService.getSettlementsForMember(eq(memberId), any(Pageable.class)))
                .thenReturn(Page.empty());

        assertEquals(HttpStatus.OK,
                controller.getMemberSettlements(memberId, 0, 10).getStatusCode());

        verify(settlementService).getSettlementsForMember(eq(memberId), any(Pageable.class));
        verifyNoInteractions(userServiceClient, transactionService);
    }

    private SettlementPreviewRequest request() {
        SettlementPreviewRequest request = new SettlementPreviewRequest();
        request.setMemberId(UUID.randomUUID());
        return request;
    }
}
