package com.chitfund.paymentservice.service;

import com.chitfund.paymentservice.domain.MemberCreditBalance;
import com.chitfund.paymentservice.domain.MemberCreditTransaction;
import com.chitfund.paymentservice.repository.MemberCreditBalanceRepository;
import com.chitfund.paymentservice.repository.MemberCreditTransactionRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class MemberCreditSettlementReversalTest {
    @Mock private MemberCreditBalanceRepository creditBalanceRepository;
    @Mock private MemberCreditTransactionRepository creditTxnRepository;
    @InjectMocks private MemberCreditService service;

    @Test
    void restoresConsumedCreditWithAnExactlyLinkedCompensatingTransaction() {
        UUID memberId = UUID.randomUUID();
        UUID settlementId = UUID.randomUUID();
        UUID originalId = UUID.randomUUID();
        UUID actorId = UUID.randomUUID();
        MemberCreditBalance balance = MemberCreditBalance.builder()
                .memberId(memberId)
                .balance(new BigDecimal("25.00"))
                .build();
        MemberCreditTransaction original = MemberCreditTransaction.builder()
                .id(originalId)
                .memberId(memberId)
                .amount(new BigDecimal("100.00"))
                .type("OUT")
                .sourceSettlementId(settlementId)
                .build();
        when(creditTxnRepository.findBySourceSettlementId(settlementId))
                .thenReturn(List.of(original));
        when(creditTxnRepository.existsByReversalOfId(originalId)).thenReturn(false);
        when(creditBalanceRepository.findByMemberIdForUpdate(memberId))
                .thenReturn(Optional.of(balance));

        BigDecimal reversed = service.reverseCreditForSettlement(settlementId, memberId, actorId);

        assertThat(reversed).isEqualByComparingTo("100.00");
        assertThat(balance.getBalance()).isEqualByComparingTo("125.00");
        ArgumentCaptor<MemberCreditTransaction> saved =
                ArgumentCaptor.forClass(MemberCreditTransaction.class);
        verify(creditTxnRepository).save(saved.capture());
        assertThat(saved.getValue().getType()).isEqualTo("IN");
        assertThat(saved.getValue().getSourceSettlementId()).isEqualTo(settlementId);
        assertThat(saved.getValue().getReversalOfId()).isEqualTo(originalId);
        assertThat(saved.getValue().getCreatedBy()).isEqualTo(actorId);
    }

    @Test
    void repeatedReversalReportsOriginalAmountWithoutPostingAnotherMovement() {
        UUID memberId = UUID.randomUUID();
        UUID settlementId = UUID.randomUUID();
        UUID originalId = UUID.randomUUID();
        MemberCreditTransaction original = MemberCreditTransaction.builder()
                .id(originalId)
                .memberId(memberId)
                .amount(new BigDecimal("100.00"))
                .type("OUT")
                .sourceSettlementId(settlementId)
                .build();
        when(creditTxnRepository.findBySourceSettlementId(settlementId))
                .thenReturn(List.of(original));
        when(creditTxnRepository.existsByReversalOfId(originalId)).thenReturn(true);

        BigDecimal reversed = service.reverseCreditForSettlement(
                settlementId, memberId, UUID.randomUUID());

        assertThat(reversed).isEqualByComparingTo("100.00");
        verify(creditBalanceRepository, never()).findByMemberIdForUpdate(any());
        verify(creditTxnRepository, never()).save(any());
    }
}
