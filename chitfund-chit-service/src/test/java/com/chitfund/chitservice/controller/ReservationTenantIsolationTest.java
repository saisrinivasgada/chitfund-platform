package com.chitfund.chitservice.controller;

import com.chitfund.chitservice.client.AuditClient;
import com.chitfund.chitservice.domain.entity.Chit;
import com.chitfund.chitservice.domain.entity.MonthReservation;
import com.chitfund.chitservice.domain.enums.ReservationStatus;
import com.chitfund.chitservice.dto.request.ReservationSlotRequest;
import com.chitfund.chitservice.mapper.ChitMapper;
import com.chitfund.chitservice.repository.MonthReservationRepository;
import com.chitfund.chitservice.service.ChitService;
import com.chitfund.chitservice.service.PlanLimitChecker;
import com.chitfund.common.exception.BusinessException;
import com.chitfund.common.exception.ResourceNotFoundException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.core.Authentication;

import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class ReservationTenantIsolationTest {

    @Mock ChitService chitService;
    @Mock MonthReservationRepository reservationRepository;
    @Mock ChitMapper chitMapper;
    @Mock AuditClient auditClient;
    @Mock PlanLimitChecker planLimitChecker;
    @Mock Authentication authentication;

    @InjectMocks ReservationController controller;

    @Test
    void listRejectsAChitOutsideTheCurrentTenantBeforeReadingItsSchedule() {
        UUID chitId = UUID.randomUUID();
        when(chitService.findByIdScoped(chitId))
                .thenThrow(new ResourceNotFoundException("Chit", chitId));

        assertThrows(ResourceNotFoundException.class, () -> controller.list(chitId));

        verifyNoInteractions(reservationRepository);
    }

    @Test
    void updateCannotUseAReservationThatDoesNotBelongToTheRouteChit() {
        UUID actorId = UUID.randomUUID();
        UUID chitId = UUID.randomUUID();
        UUID reservationId = UUID.randomUUID();
        when(authentication.getPrincipal()).thenReturn(actorId);
        when(chitService.findByIdScoped(chitId)).thenReturn(Chit.builder().id(chitId).build());
        when(reservationRepository.findByIdAndChitId(reservationId, chitId)).thenReturn(Optional.empty());

        assertThrows(ResourceNotFoundException.class, () -> controller.updateSlot(
                chitId, reservationId, new ReservationSlotRequest(), authentication));

        verify(reservationRepository, never()).save(any());
    }

    @Test
    void permanentDeleteIsRejectedSoVoidedHistoryRemainsAuditable() {
        UUID chitId = UUID.randomUUID();
        UUID reservationId = UUID.randomUUID();
        Chit chit = Chit.builder().id(chitId).build();
        MonthReservation reservation = MonthReservation.builder()
                .id(reservationId)
                .chit(chit)
                .status(ReservationStatus.VOIDED)
                .createdBy(UUID.randomUUID())
                .build();
        when(chitService.findByIdScoped(chitId)).thenReturn(chit);
        when(reservationRepository.findByIdAndChitId(reservationId, chitId))
                .thenReturn(Optional.of(reservation));

        assertThrows(BusinessException.class, () -> controller.permanentlyDeleteSlot(
                chitId, reservationId, authentication));

        verify(reservationRepository, never()).delete(any());
    }
}
