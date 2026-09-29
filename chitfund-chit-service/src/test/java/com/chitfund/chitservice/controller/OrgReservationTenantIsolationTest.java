package com.chitfund.chitservice.controller;

import com.chitfund.chitservice.mapper.ChitMapper;
import com.chitfund.chitservice.repository.MonthReservationRepository;
import com.chitfund.chitservice.service.ChitService;
import com.chitfund.common.context.TenantContext;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class OrgReservationTenantIsolationTest {

    @Mock ChitService chitService;
    @Mock MonthReservationRepository reservationRepository;
    @Mock ChitMapper chitMapper;

    @InjectMocks ChitController controller;

    @AfterEach
    void clearContext() {
        TenantContext.clear();
    }

    @Test
    void organizationReservationsAreQueriedOnlyForTheCurrentTenant() {
        TenantContext.set("tenant-a");
        when(reservationRepository.findAllOrgHeldByTenant("tenant-a")).thenReturn(List.of());

        controller.getOrgReservations();

        verify(reservationRepository).findAllOrgHeldByTenant("tenant-a");
    }
}
