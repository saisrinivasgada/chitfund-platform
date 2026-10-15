package com.chitfund.chitservice.service;

import com.chitfund.chitservice.client.AuditClient;
import com.chitfund.chitservice.client.NotificationClient;
import com.chitfund.chitservice.dto.request.OverrideResponseRequest;
import com.chitfund.chitservice.repository.ChitEnrollmentRepository;
import com.chitfund.chitservice.repository.ChitInvitationRepository;
import com.chitfund.chitservice.repository.InvitationResponseRepository;
import com.chitfund.chitservice.repository.MonthReservationRepository;
import com.chitfund.common.context.TenantContext;
import com.chitfund.common.exception.ResourceNotFoundException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class InvitationTenantIsolationTest {

    @Mock ChitService chitService;
    @Mock ChitInvitationRepository invitationRepository;
    @Mock InvitationResponseRepository responseRepository;
    @Mock ChitEnrollmentRepository enrollmentRepository;
    @Mock MonthReservationRepository reservationRepository;
    @Mock NotificationClient notificationClient;
    @Mock AuditClient auditClient;
    @Mock ObjectMapper objectMapper;

    @InjectMocks InvitationService invitationService;

    @AfterEach
    void clearContext() {
        TenantContext.clear();
    }

    @Test
    void invitationListCannotReadAChitFromAnotherTenant() {
        UUID chitId = UUID.randomUUID();
        when(chitService.findByIdScoped(chitId))
                .thenThrow(new ResourceNotFoundException("Chit", chitId));

        assertThrows(ResourceNotFoundException.class, () -> invitationService.listInvitations(chitId));

        verifyNoInteractions(invitationRepository);
    }

    @Test
    void responseOverrideMustMatchTenantChitAndInvitationRoute() {
        TenantContext.set("tenant-a");
        UUID chitId = UUID.randomUUID();
        UUID invitationId = UUID.randomUUID();
        UUID responseId = UUID.randomUUID();
        when(responseRepository.findScopedResponse(responseId, invitationId, chitId, "tenant-a"))
                .thenReturn(Optional.empty());

        assertThrows(ResourceNotFoundException.class, () -> invitationService.overrideResponse(
                chitId, invitationId, responseId, new OverrideResponseRequest()));

        verify(responseRepository, never()).save(any());
    }
}
