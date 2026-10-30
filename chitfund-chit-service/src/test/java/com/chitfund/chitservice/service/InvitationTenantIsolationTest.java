package com.chitfund.chitservice.service;

import com.chitfund.chitservice.client.AuditClient;
import com.chitfund.chitservice.client.NotificationClient;
import com.chitfund.chitservice.dto.request.OverrideResponseRequest;
import com.chitfund.chitservice.dto.request.RespondToInvitationRequest;
import com.chitfund.chitservice.dto.request.SendInvitationRequest;
import com.chitfund.chitservice.domain.entity.Chit;
import com.chitfund.chitservice.domain.entity.ChitInvitation;
import com.chitfund.chitservice.domain.entity.InvitationResponse;
import com.chitfund.chitservice.domain.enums.ChitStatus;
import com.chitfund.chitservice.domain.enums.ChitType;
import com.chitfund.chitservice.domain.enums.InvitationStatus;
import com.chitfund.chitservice.repository.ChitEnrollmentRepository;
import com.chitfund.chitservice.repository.ChitInvitationRepository;
import com.chitfund.chitservice.repository.InvitationResponseRepository;
import com.chitfund.chitservice.repository.MonthReservationRepository;
import com.chitfund.common.context.TenantContext;
import com.chitfund.common.exception.ResourceNotFoundException;
import com.chitfund.common.exception.BusinessException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.util.List;
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

    @Test
    void invitationExpiryMustBeInTheFuture() {
        TenantContext.set("tenant-a");
        UUID chitId = UUID.randomUUID();
        Chit chit = Chit.builder().id(chitId).tenantId("tenant-a")
                .status(ChitStatus.DRAFT).chitType(ChitType.AUCTION).capacity(10).build();
        SendInvitationRequest request = new SendInvitationRequest();
        request.setMemberIds(List.of(UUID.randomUUID()));
        request.setExpiresAt(LocalDateTime.now().minusMinutes(1));
        when(chitService.findByIdForUpdate(chitId)).thenReturn(chit);
        when(enrollmentRepository.countByChitIdAndActiveTrue(chitId)).thenReturn(0L);

        assertThrows(BusinessException.class,
                () -> invitationService.sendInvitation(chitId, UUID.randomUUID(), request));
        verify(invitationRepository, never()).save(any());
    }

    @Test
    void memberCannotRespondAfterInvitationExpires() {
        TenantContext.set("tenant-a");
        UUID invitationId = UUID.randomUUID();
        UUID memberId = UUID.randomUUID();
        ChitInvitation invitation = ChitInvitation.builder()
                .id(invitationId).tenantId("tenant-a").status(InvitationStatus.OPEN)
                .expiresAt(LocalDateTime.now().minusSeconds(1)).build();
        InvitationResponse response = InvitationResponse.builder()
                .invitation(invitation).memberId(memberId).build();
        when(responseRepository.findByInvitationIdAndMemberIdAndInvitation_TenantId(
                invitationId, memberId, "tenant-a")).thenReturn(Optional.of(response));

        assertThrows(BusinessException.class, () -> invitationService.respondToInvitation(
                invitationId, memberId, new RespondToInvitationRequest()));
        verify(responseRepository, never()).save(any());
    }
}
