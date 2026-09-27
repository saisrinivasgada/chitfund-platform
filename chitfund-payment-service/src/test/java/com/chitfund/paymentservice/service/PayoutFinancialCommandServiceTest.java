package com.chitfund.paymentservice.service;

import com.chitfund.common.context.TenantContext;
import com.chitfund.common.dto.PayoutFinancialCommandRequest;
import com.chitfund.common.exception.BusinessException;
import com.chitfund.paymentservice.domain.InternalFinancialOperation;
import com.chitfund.paymentservice.repository.InternalFinancialOperationRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class PayoutFinancialCommandServiceTest {
    @Mock InternalFinancialOperationRepository receiptRepository;
    @Mock PaymentService paymentService;
    @Mock AdminWalletService walletService;
    @InjectMocks PayoutFinancialCommandService service;

    @AfterEach
    void clearTenant() {
        TenantContext.clear();
    }

    @Test
    void sameCommandAndRequestAppliesSideEffectExactlyOnce() {
        PayoutFinancialCommandRequest request = installmentCommand(BigDecimal.valueOf(750));
        ArgumentCaptor<InternalFinancialOperation> receipt =
                ArgumentCaptor.forClass(InternalFinancialOperation.class);
        when(receiptRepository.findById(request.commandId()))
                .thenReturn(Optional.empty())
                .thenAnswer(inv -> Optional.of(receipt.getValue()));
        when(receiptRepository.saveAndFlush(receipt.capture()))
                .thenAnswer(inv -> inv.getArgument(0));

        service.execute(request);
        service.execute(request);

        verify(paymentService, times(1)).markPayoutDeducted(
                request.chitId(), request.memberId(), request.monthNumber(), request.amount(),
                request.payoutId(), request.tenantId());
        verify(receiptRepository, times(1)).saveAndFlush(any());
        assertThat(receipt.getValue().getTenantId()).isEqualTo(request.tenantId());
    }

    @Test
    void reusedCommandIdWithDifferentDetailsConflicts() {
        PayoutFinancialCommandRequest original = installmentCommand(BigDecimal.valueOf(750));
        ArgumentCaptor<InternalFinancialOperation> receipt =
                ArgumentCaptor.forClass(InternalFinancialOperation.class);
        when(receiptRepository.findById(original.commandId())).thenReturn(Optional.empty());
        when(receiptRepository.saveAndFlush(receipt.capture()))
                .thenAnswer(inv -> inv.getArgument(0));
        service.execute(original);

        reset(receiptRepository, paymentService, walletService);
        when(receiptRepository.findById(original.commandId()))
                .thenReturn(Optional.of(receipt.getValue()));
        PayoutFinancialCommandRequest changed = new PayoutFinancialCommandRequest(
                original.commandId(), original.commandType(), original.tenantId(),
                original.actorId(), original.payoutId(), original.chitId(), original.memberId(),
                original.monthNumber(), BigDecimal.valueOf(751), null);

        assertThatThrownBy(() -> service.execute(changed))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("different details");
        verifyNoInteractions(paymentService, walletService);
    }

    @Test
    void restoresCallingTenantEvenWhenFinancialMutationFails() {
        TenantContext.set("caller-tenant");
        PayoutFinancialCommandRequest request = installmentCommand(BigDecimal.valueOf(750));
        when(receiptRepository.findById(request.commandId())).thenReturn(Optional.empty());
        when(receiptRepository.saveAndFlush(any())).thenAnswer(inv -> inv.getArgument(0));
        doThrow(new IllegalStateException("test failure")).when(paymentService)
                .markPayoutDeducted(any(), any(), anyInt(), any(), any(), any());

        assertThatThrownBy(() -> service.execute(request))
                .isInstanceOf(IllegalStateException.class);
        assertThat(TenantContext.get()).isEqualTo("caller-tenant");
    }

    @Test
    void rejectsUnknownTreasuryModeBeforeWritingWallet() {
        PayoutFinancialCommandRequest request = new PayoutFinancialCommandRequest(
                UUID.randomUUID(), "RECORD_TREASURY_DEBIT", "tenant-a",
                UUID.randomUUID(), UUID.randomUUID(), null, UUID.randomUUID(), null,
                BigDecimal.valueOf(100), "CRYPTO");
        assertThatThrownBy(() -> service.execute(request))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("Unsupported disbursement mode");
        verifyNoInteractions(walletService);
        verify(receiptRepository, never()).saveAndFlush(any());
    }

    private PayoutFinancialCommandRequest installmentCommand(BigDecimal amount) {
        return new PayoutFinancialCommandRequest(
                UUID.randomUUID(), "MARK_INSTALLMENT_DEDUCTION", "tenant-a",
                UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), 2,
                amount, null);
    }
}
