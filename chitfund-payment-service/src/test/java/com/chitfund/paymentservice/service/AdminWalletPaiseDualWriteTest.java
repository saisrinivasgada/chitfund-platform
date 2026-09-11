package com.chitfund.paymentservice.service;

import com.chitfund.paymentservice.domain.AdminWalletEntry;
import com.chitfund.paymentservice.domain.enums.AccountType;
import com.chitfund.paymentservice.domain.enums.WalletEntryType;
import com.chitfund.paymentservice.dto.request.AdminWalletEntryRequest;
import com.chitfund.paymentservice.dto.request.TransferRequest;
import com.chitfund.paymentservice.repository.AdminWalletRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.math.BigDecimal;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AdminWalletPaiseDualWriteTest {

    private AdminWalletRepository repository;
    private AdminWalletService service;

    @BeforeEach
    void setUp() {
        repository = mock(AdminWalletRepository.class);
        when(repository.save(any(AdminWalletEntry.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));
        service = new AdminWalletService(
                repository, mock(PlanExpiryChecker.class), mock(MemberCreditService.class));
    }

    @Test
    void ordinaryEntryWritesDecimalAndExactPaise() {
        AdminWalletEntryRequest request = new AdminWalletEntryRequest();
        request.setAccountType(AccountType.CASH);
        request.setEntryType(WalletEntryType.IN);
        request.setAmount(new BigDecimal("1234.56"));

        service.addEntry(request, UUID.randomUUID(), "tenant-a");

        ArgumentCaptor<AdminWalletEntry> captor =
                ArgumentCaptor.forClass(AdminWalletEntry.class);
        verify(repository).save(captor.capture());
        assertThat(captor.getValue().getAmount()).isEqualByComparingTo("1234.56");
        assertThat(captor.getValue().getAmountPaise()).isEqualTo(123456L);
    }

    @Test
    void bothTransferLegsUseTheSameExactPaise() {
        TransferRequest request = new TransferRequest();
        request.setFromAccount(AccountType.CASH);
        request.setAmount(new BigDecimal("87.65"));

        service.transfer(request, UUID.randomUUID(), "tenant-a");

        ArgumentCaptor<AdminWalletEntry> captor =
                ArgumentCaptor.forClass(AdminWalletEntry.class);
        verify(repository, times(2)).save(captor.capture());
        assertThat(captor.getAllValues())
                .extracting(AdminWalletEntry::getAmountPaise)
                .containsExactly(8765L, 8765L);
    }
}
