package com.chitfund.paymentservice.service;

import com.chitfund.paymentservice.domain.MemberCreditBalance;
import com.chitfund.paymentservice.domain.MemberCreditTransaction;
import com.chitfund.paymentservice.dto.response.MemberCreditResponse;
import com.chitfund.paymentservice.repository.MemberCreditBalanceRepository;
import com.chitfund.paymentservice.repository.MemberCreditTransactionRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class MemberCreditService {

    private final MemberCreditBalanceRepository creditBalanceRepository;
    private final MemberCreditTransactionRepository creditTxnRepository;

    @Transactional(readOnly = true)
    public BigDecimal getBalance(UUID memberId) {
        return creditBalanceRepository.findByMemberId(memberId)
                .map(MemberCreditBalance::getBalance)
                .orElse(BigDecimal.ZERO);
    }

    @Transactional(readOnly = true)
    public MemberCreditResponse getCreditDetails(UUID memberId) {
        BigDecimal balance = getBalance(memberId);
        List<MemberCreditTransaction> txns = creditTxnRepository
                .findByMemberIdOrderByCreatedAtDesc(memberId);

        List<MemberCreditResponse.CreditTransaction> txnDtos = txns.stream()
                .limit(20)
                .map(t -> MemberCreditResponse.CreditTransaction.builder()
                        .id(t.getId())
                        .amount(t.getAmount())
                        .type(t.getType())
                        .sourceBatchId(t.getSourceBatchId())
                        .chitId(t.getChitId())
                        .description(t.getDescription())
                        .createdAt(t.getCreatedAt())
                        .build())
                .toList();

        return MemberCreditResponse.builder()
                .memberId(memberId)
                .balance(balance)
                .recentTransactions(txnDtos)
                .build();
    }

    /**
     * Add credit to a member's balance (overpayment scenario).
     * Creates both a balance update and an audit transaction row.
     */
    @Transactional
    public void addCredit(UUID memberId, BigDecimal amount, UUID batchId, UUID chitId, UUID actorId, String description) {
        if (amount.compareTo(BigDecimal.ZERO) <= 0) return;

        MemberCreditBalance credit = creditBalanceRepository.findByMemberIdForUpdate(memberId)
                .orElseGet(() -> MemberCreditBalance.builder()
                        .memberId(memberId)
                        .balance(BigDecimal.ZERO)
                        .build());
        credit.setBalance(credit.getBalance().add(amount));
        creditBalanceRepository.save(credit);

        creditTxnRepository.save(MemberCreditTransaction.builder()
                .memberId(memberId)
                .amount(amount)
                .type("IN")
                .sourceBatchId(batchId)
                .chitId(chitId)
                .description(description)
                .createdBy(actorId)
                .build());

        log.info("Credit IN ₹{} for member {} (batch {}) — balance now ₹{}",
                amount, memberId, batchId, credit.getBalance());
    }

    /**
     * Consume credit from a member's balance (auto-applied to their outstanding).
     * Creates both a balance update and an audit transaction row.
     */
    @Transactional
    public void consumeCredit(UUID memberId, BigDecimal amount, UUID batchId, UUID chitId, UUID actorId, String description) {
        if (amount.compareTo(BigDecimal.ZERO) <= 0) return;

        MemberCreditBalance credit = creditBalanceRepository.findByMemberIdForUpdate(memberId)
                .orElseGet(() -> MemberCreditBalance.builder()
                        .memberId(memberId)
                        .balance(BigDecimal.ZERO)
                        .build());

        BigDecimal newBalance = credit.getBalance().subtract(amount);
        if (newBalance.compareTo(BigDecimal.ZERO) < 0) newBalance = BigDecimal.ZERO;
        credit.setBalance(newBalance);
        creditBalanceRepository.save(credit);

        creditTxnRepository.save(MemberCreditTransaction.builder()
                .memberId(memberId)
                .amount(amount)
                .type("OUT")
                .sourceBatchId(batchId)
                .chitId(chitId)
                .description(description)
                .createdBy(actorId)
                .build());

        log.info("Credit OUT ₹{} for member {} (batch {}) — balance now ₹{}",
                amount, memberId, batchId, newBalance);
    }

    /**
     * Reverses all credit movements caused by a specific batch.
     * Called when a payment batch is voided.
     *
     * WHY reverse via transaction table instead of a single stored field?
     * A batch can produce both a credit-OUT (auto-consumed) AND a credit-IN (overpayment).
     * Tracking each movement separately lets us reverse exactly what happened,
     * with no ambiguity — even if the same batch both consumed and generated credit.
     */
    @Transactional
    public void reverseCreditForVoidedBatch(UUID batchId, UUID memberId, UUID actorId) {
        List<MemberCreditTransaction> txns = creditTxnRepository.findBySourceBatchId(batchId);
        if (txns.isEmpty()) return;

        for (MemberCreditTransaction txn : txns) {
            if ("IN".equals(txn.getType())) {
                // Credit was added from this batch's overpayment → now remove it
                consumeCredit(memberId, txn.getAmount(), batchId, txn.getChitId(), actorId,
                        "Void reversal — removing credit created by voided batch " + batchId);
            } else {
                // Credit was consumed by this batch → restore it
                addCredit(memberId, txn.getAmount(), batchId, txn.getChitId(), actorId,
                        "Void reversal — restoring credit consumed by voided batch " + batchId);
            }
        }
        log.info("Reversed {} credit transaction(s) for voided batch {} (member {})",
                txns.size(), batchId, memberId);
    }
}
