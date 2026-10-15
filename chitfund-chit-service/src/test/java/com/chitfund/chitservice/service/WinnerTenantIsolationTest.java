package com.chitfund.chitservice.service;

import com.chitfund.chitservice.client.AuditClient;
import com.chitfund.chitservice.mapper.ChitMapper;
import com.chitfund.chitservice.repository.ChitEnrollmentRepository;
import com.chitfund.chitservice.repository.MonthReservationRepository;
import com.chitfund.chitservice.repository.MonthlyWinnerRepository;
import com.chitfund.chitservice.strategy.WinnerSelectionStrategyFactory;
import com.chitfund.common.exception.ResourceNotFoundException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class WinnerTenantIsolationTest {

    @Mock ChitService chitService;
    @Mock ChitEnrollmentRepository enrollmentRepository;
    @Mock MonthlyWinnerRepository winnerRepository;
    @Mock MonthReservationRepository reservationRepository;
    @Mock WinnerSelectionStrategyFactory strategyFactory;
    @Mock ChitMapper chitMapper;
    @Mock AuditClient auditClient;
    @Mock PlanLimitChecker planLimitChecker;

    @InjectMocks WinnerService winnerService;

    @Test
    void winnerHistoryCannotBeReadAcrossTenants() {
        UUID chitId = UUID.randomUUID();
        when(chitService.findByIdScoped(chitId))
                .thenThrow(new ResourceNotFoundException("Chit", chitId));

        assertThrows(ResourceNotFoundException.class, () -> winnerService.listWinners(chitId));

        verifyNoInteractions(winnerRepository);
        verify(chitService, never()).findById(chitId);
    }
}
