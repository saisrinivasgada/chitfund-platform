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

    /** Locks the balance while a financial workflow decides and records its use. */
    @Transactional
    public BigDecimal getBalanceForUpdate(UUID memberId) {
        return creditBalanceRepository.findByMemberIdForUpdate(memberId)
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
        recordMovement(memberId, amount, "IN", batchId, null, null, chitId, actorId, description);
    }

    /**
     * Consume credit from a member's balance (auto-applied to their outstanding).
     * Creates both a balance update and an audit transaction row.
     */
    @Transactional
    public void consumeCredit(UUID memberId, BigDecimal amount, UUID batchId, UUID chitId, UUID actorId, String description) {
        recordMovement(memberId, amount, "OUT", batchId, null, null, chitId, actorId, description);
    }

    /** Records credit consumed by settlement confirmation with an explicit audit link. */
    @Transactional
    public void consumeCreditForSettlement(UUID memberId, BigDecimal amount, UUID settlementId,
                                           UUID actorId, String description) {
        recordMovement(memberId, amount, "OUT", null, settlementId, null, null, actorId, description);
    }

    /** Restores exactly the credit movements created by one reversible settlement. */
    @Transactional
    public BigDecimal reverseCreditForSettlement(UUID settlementId, UUID memberId, UUID actorId) {
        List<MemberCreditTransaction> originals = creditTxnRepository.findBySourceSettlementId(settlementId);
        BigDecimal reversed = BigDecimal.ZERO;
        for (MemberCreditTransaction original : originals) {
            if (original.getReversalOfId() != null) {
                continue;
            }
            reversed = reversed.add(original.getAmount());
            if (creditTxnRepository.existsByReversalOfId(original.getId())) continue;
            String reverseType = "IN".equals(original.getType()) ? "OUT" : "IN";
            recordMovement(memberId, original.getAmount(), reverseType, null, settlementId,
                    original.getId(), original.getChitId(), actorId,
                    "Settlement reversal for credit transaction " + original.getId());
        }
        return reversed;
    }

    private void recordMovement(UUID memberId, BigDecimal amount, String type,
                                UUID batchId, UUID settlementId, UUID reversalOfId,
                                UUID chitId, UUID actorId, String description) {
        if (amount == null || amount.compareTo(BigDecimal.ZERO) <= 0) return;

        MemberCreditBalance credit = creditBalanceRepository.findByMemberIdForUpdate(memberId)
                .orElseGet(() -> MemberCreditBalance.builder()
                        .memberId(memberId)
                        .balance(BigDecimal.ZERO)
                        .build());
        BigDecimal newBalance = "IN".equals(type)
                ? credit.getBalance().add(amount)
                : credit.getBalance().subtract(amount);
        if (newBalance.compareTo(BigDecimal.ZERO) < 0) {
            // Settlement movements must be exact and auditable. Preserve the
            // pre-existing clamp only for legacy payment-batch consumption.
            if (settlementId != null) {
                throw new IllegalStateException("Settlement credit movement would make the member balance negative");
            }
            newBalance = BigDecimal.ZERO;
        }
        credit.setBalance(newBalance);
        creditBalanceRepository.save(credit);

        creditTxnRepository.save(MemberCreditTransaction.builder()
                .memberId(memberId)
                .amount(amount)
                .type(type)
                .sourceBatchId(batchId)
                .sourceSettlementId(settlementId)
                .reversalOfId(reversalOfId)
                .chitId(chitId)
                .description(description)
                .createdBy(actorId)
                .build());

        log.info("Credit {} ₹{} for member {} (batch {}, settlement {}) — balance now ₹{}",
                type, amount, memberId, batchId, settlementId, newBalance);
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
