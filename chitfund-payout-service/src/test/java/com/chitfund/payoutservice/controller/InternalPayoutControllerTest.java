package com.chitfund.payoutservice.controller;

import com.chitfund.payoutservice.domain.Payout;
import com.chitfund.payoutservice.domain.enums.PayoutStatus;
import com.chitfund.payoutservice.dto.response.PayoutResponse;
import com.chitfund.payoutservice.repository.PayoutRepository;
import com.chitfund.payoutservice.service.PayoutService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

class InternalPayoutControllerTest {

    private PayoutRepository repository;
    private PayoutService service;
    private InternalPayoutController controller;

    @BeforeEach
    void setUp() {
        repository = mock(PayoutRepository.class);
        service = mock(PayoutService.class);
        controller = new InternalPayoutController(repository, service);
        ReflectionTestUtils.setField(controller, "internalKey", "internal-secret");
    }

    @Test
    void scopesLookupAndResponseToCallingTenant() {
        UUID memberId = UUID.randomUUID();
        UUID chitId = UUID.randomUUID();
        UUID payoutId = UUID.randomUUID();
        Payout payout = mock(Payout.class);
        when(payout.getId()).thenReturn(payoutId);
        when(payout.getStatus()).thenReturn(PayoutStatus.PENDING);
        when(repository.findByTenantIdAndMemberIdAndChitIdAndStatusNotInOrderByCreatedAtDesc(
                "tenant-a", memberId, chitId, List.of(PayoutStatus.CANCELLED, PayoutStatus.VOIDED)))
                .thenReturn(List.of(payout));
        when(service.getByIdForTenant(payoutId, "tenant-a"))
                .thenReturn(PayoutResponse.builder().id(payoutId).build());

        var response = controller.getPayoutForMemberInChit(
                memberId, chitId, "internal-secret", "tenant-a");

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        verify(service).getByIdForTenant(payoutId, "tenant-a");
    }

    @Test
    void invalidServiceCredentialCannotProbeTenantData() {
        var response = controller.getPayoutForMemberInChit(
                UUID.randomUUID(), UUID.randomUUID(), "wrong", "tenant-a");

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        verifyNoInteractions(repository, service);
    }

    @Test
    void blankTenantCannotFallBackToCrossTenantLookup() {
        var response = controller.getPayoutForMemberInChit(
                UUID.randomUUID(), UUID.randomUUID(), "internal-secret", " ");

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        verifyNoInteractions(repository, service);
    }

    @Test
    @SuppressWarnings("unchecked")
    void drawDependencyCountIncludesHistoricalPayoutRowsWithinTenant() {
        UUID chitId = UUID.randomUUID();
        when(repository.countByTenantIdAndChitIdAndMonthNumber("tenant-a", chitId, 4))
                .thenReturn(3L);

        var response = controller.getDrawDependencies(
                chitId, 4, "internal-secret", "tenant-a");

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        var body = (com.chitfund.common.dto.ApiResponse<java.util.Map<String, Object>>) response.getBody();
        assertThat(body).isNotNull();
        assertThat(body.getData()).containsEntry("payoutCount", 3L);
    }

    @Test
    void drawDependencyProbeRejectsInvalidServiceCredential() {
        var response = controller.getDrawDependencies(
                UUID.randomUUID(), 1, "wrong", "tenant-a");

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        verifyNoInteractions(repository, service);
    }
}
