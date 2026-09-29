package com.chitfund.chitservice.service;

import com.chitfund.chitservice.client.AuditClient;
import com.chitfund.chitservice.client.NotificationClient;
import com.chitfund.chitservice.domain.entity.Chit;
import com.chitfund.chitservice.domain.enums.ChitStatus;
import com.chitfund.chitservice.domain.enums.ChitType;
import com.chitfund.chitservice.domain.enums.WinnerSelectionMode;
import com.chitfund.chitservice.dto.response.ChitResponse;
import com.chitfund.chitservice.mapper.ChitMapper;
import com.chitfund.chitservice.repository.ChitEnrollmentRepository;
import com.chitfund.chitservice.repository.ChitRepository;
import com.chitfund.chitservice.repository.ChitLifecycleCommandRepository;
import com.chitfund.chitservice.repository.MonthReservationRepository;
import com.chitfund.chitservice.repository.MonthlyWinnerRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.math.BigDecimal;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ChitServiceLifecycleAuditTest {
    private static final String TENANT_ID = "tenant-1";
    @Mock ChitRepository chitRepository;
    @Mock ChitEnrollmentRepository enrollmentRepository;
    @Mock MonthlyWinnerRepository winnerRepository;
    @Mock MonthReservationRepository reservationRepository;
    @Mock ChitMapper chitMapper;
    @Mock ChitAttributeService attributeService;
    @Mock NotificationClient notificationClient;
    @Mock PlanLimitChecker planLimitChecker;
    @Mock AuditClient auditClient;
    @Mock ChitLifecycleCommandStore lifecycleCommandStore;
    @Mock ChitLifecycleCommandRepository lifecycleCommandRepository;

    ChitService service;

    @BeforeEach
    void setUp() {
        service = new ChitService(chitRepository, enrollmentRepository, winnerRepository,
                reservationRepository, chitMapper, attributeService, notificationClient,
                planLimitChecker, auditClient, lifecycleCommandStore,
                lifecycleCommandRepository);
        TransactionSynchronizationManager.initSynchronization();
    }

    @AfterEach
    void tearDown() {
        TransactionSynchronizationManager.clearSynchronization();
    }

    @Test
    void payoutCompletionUsesPersistedTenantAndCreatesSystemAudit() {
        Chit chit = chit(ChitStatus.ACTIVE);
        when(chitRepository.findByIdAndTenantIdAndDeletedAtIsNull(chit.getId(), TENANT_ID))
                .thenReturn(Optional.of(chit));
        when(chitRepository.save(chit)).thenReturn(chit);
        when(chitMapper.toResponse(chit)).thenReturn(mock(ChitResponse.class));
        when(attributeService.getAll(chit)).thenReturn(Map.of());

        service.completeAfterFinalDisbursement(chit.getId(), TENANT_ID);

        assertThat(chit.getStatus()).isEqualTo(ChitStatus.COMPLETED);
        verify(auditClient).log(eq("CHIT"), eq(chit.getId().toString()),
                eq(chit.getId().toString()), eq("CHIT_COMPLETED"), eq(null), eq("SYSTEM"),
                any(), any(), eq("tenant-1"));
        verify(lifecycleCommandStore).enqueueCloseDraws(TENANT_ID, chit.getId());
    }

    @Test
    void duplicatePayoutCompletionIsIdempotentAndDoesNotDuplicateAudit() {
        Chit chit = chit(ChitStatus.COMPLETED);
        when(chitRepository.findByIdAndTenantIdAndDeletedAtIsNull(chit.getId(), TENANT_ID))
                .thenReturn(Optional.of(chit));
        when(chitMapper.toResponse(chit)).thenReturn(mock(ChitResponse.class));
        when(attributeService.getAll(chit)).thenReturn(Map.of());

        service.completeAfterFinalDisbursement(chit.getId(), TENANT_ID);

        verify(chitRepository, never()).save(any());
        verify(auditClient, never()).log(any(), any(), any(), any(), any(), any(),
                any(), any(), any());
        verify(lifecycleCommandStore).enqueueCloseDraws(TENANT_ID, chit.getId());
    }

    private Chit chit(ChitStatus status) {
        return Chit.builder()
                .id(UUID.randomUUID())
                .tenantId("tenant-1")
                .name("Monthly Gold")
                .status(status)
                .chitType(ChitType.RESERVATION)
                .winnerSelectionMode(WinnerSelectionMode.RESERVATION)
                .chitValue(new BigDecimal("100000.00"))
                .installmentAmount(new BigDecimal("10000.00"))
                .totalAmount(new BigDecimal("100000.00"))
                .capacity(10)
                .durationMonths(10)
                .createdBy(UUID.randomUUID())
                .build();
    }
}
