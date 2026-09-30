package com.chitfund.userservice.service;

import com.chitfund.userservice.domain.entity.*;
import com.chitfund.userservice.dto.request.RecordPaymentRequest;
import com.chitfund.userservice.repository.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDate;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class BillingEffectiveLimitsTest {
    @Mock PlanPaymentRepository paymentRepo;
    @Mock PlanReceiptRepository receiptRepo;
    @Mock ReceiptNumberSeqRepository seqRepo;
    @Mock TenantRepository tenantRepo;
    @Mock PlanLimitsRepository planRepo;
    @Mock UserRepository userRepo;
    @Mock TenantCustomLimitsRepository customLimitsRepo;
    @InjectMocks BillingService billingService;

    @Test
    void purchaseRefreshesAnExistingEffectiveLimitsRow() {
        UUID tenantId = UUID.randomUUID();
        String actorId = UUID.randomUUID().toString();
        Tenant tenant = Tenant.builder().id(tenantId).name("Acme").plan("BASIC").build();
        PlanLimits growth = PlanLimits.builder()
                .plan("GROWTH").displayName("Growth").isActive(true)
                .maxActiveChits(20).maxMembers(500).maxStaff(10)
                .capabilities("[\"live_chat\"]")
                .allowedChitTypes("RESERVATION,AUCTION")
                .priceMonthlyInr(49900).build();
        TenantCustomLimits existing = TenantCustomLimits.builder()
                .tenantId(tenantId.toString()).planCode("BASIC")
                .maxActiveChits(1).maxMembers(20).maxStaff(0)
                .allowedChitTypes("RESERVATION").priceMonthlyInr(9900).build();
        RecordPaymentRequest request = new RecordPaymentRequest();
        request.setTenantId(tenantId.toString());
        request.setType("PURCHASE");
        request.setToPlan("GROWTH");
        request.setAmountPaise(49900L);
        request.setGrossAmountPaise(49900L);
        request.setPaymentMethod("UPI");
        request.setPaymentDate(LocalDate.now());
        ReceiptNumberSeq sequence = mockSequence(1L);
        when(tenantRepo.findById(tenantId)).thenReturn(Optional.of(tenant));
        when(planRepo.findById("GROWTH")).thenReturn(Optional.of(growth));
        when(customLimitsRepo.findById(tenantId.toString())).thenReturn(Optional.of(existing));
        when(seqRepo.save(any())).thenReturn(sequence);
        when(receiptRepo.save(any())).thenAnswer(call -> call.getArgument(0));

        billingService.recordPayment(request, actorId);

        assertThat(existing.getPlanCode()).isEqualTo("GROWTH");
        assertThat(existing.getMaxActiveChits()).isEqualTo(20);
        assertThat(existing.getMaxMembers()).isEqualTo(500);
        assertThat(existing.getMaxStaff()).isEqualTo(10);
        verify(customLimitsRepo).save(existing);
    }

    private static ReceiptNumberSeq mockSequence(long id) {
        ReceiptNumberSeq sequence = mock(ReceiptNumberSeq.class);
        when(sequence.getId()).thenReturn(id);
        return sequence;
    }
}
