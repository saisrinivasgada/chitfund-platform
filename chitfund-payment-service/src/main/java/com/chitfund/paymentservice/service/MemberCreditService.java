package com.chitfund.paymentservice.service;

import com.chitfund.common.exception.BusinessException;
import com.chitfund.common.exception.ErrorCode;
import com.chitfund.paymentservice.domain.MemberCreditBalance;
import com.chitfund.paymentservice.domain.MemberCreditTransaction;
import com.chitfund.paymentservice.dto.response.MemberCreditResponse;
import com.chitfund.paymentservice.repository.MemberCreditBalanceRepository;
import com.chitfund.paymentservice.repository.MemberCreditTransactionRepository;
import com.chitfund.common.context.TenantContext;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
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
        return creditBalanceRepository.findByTenantIdAndMemberId(tenantId(), memberId)
                .map(MemberCreditBalance::getBalance)
                .orElse(BigDecimal.ZERO);
    }

    /** Locks the balance row for the calling transaction. */
    @Transactional
    public BigDecimal getBalanceForUpdate(UUID memberId) {
        return creditBalanceRepository.findByTenantIdAndMemberIdForUpdate(tenantId(), memberId)
                .map(MemberCreditBalance::getBalance)
                .orElse(BigDecimal.ZERO);
    }

    @Transactional(readOnly = true)
    public MemberCreditResponse getCreditDetails(UUID memberId) {
        BigDecimal balance = getBalance(memberId);
        List<MemberCreditTransaction> txns = creditTxnRepository
                .findByTenantIdAndMemberIdOrderByCreatedAtDesc(tenantId(), memberId);

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
        recordMovement(memberId, amount, "IN", batchId, null, null, null, chitId, actorId, description);
    }

    /** Adds excess auction dividend credit with a stable draw link for exact reversal. */
    @Transactional
    public void addCreditForAuctionDraw(UUID memberId, BigDecimal amount, UUID drawId, UUID chitId,
                                        UUID actorId, String description) {
        recordMovement(memberId, amount, "IN", null, null, drawId, null,
                chitId, actorId, description);
    }

    /**
     * Consume credit from a member's balance (auto-applied to their outstanding).
     * Creates both a balance update and an audit transaction row.
     */
    @Transactional
    public void consumeCredit(UUID memberId, BigDecimal amount, UUID batchId, UUID chitId, UUID actorId, String description) {
        recordMovement(memberId, amount, "OUT", batchId, null, null, null, chitId, actorId, description);
    }

    /** Records credit consumed by settlement confirmation with an explicit audit link. */
    @Transactional
    public void consumeCreditForSettlement(UUID memberId, BigDecimal amount, UUID settlementId,
                                           UUID actorId, String description) {
        recordMovement(memberId, amount, "OUT", null, settlementId, null, null, null, actorId, description);
    }

    /** Restores exactly the credit movements created by one reversible settlement. */
    @Transactional
    public BigDecimal reverseCreditForSettlement(UUID settlementId, UUID memberId, UUID actorId) {
        String tenantId = tenantId();
        List<MemberCreditTransaction> originals =
                creditTxnRepository.findByTenantIdAndSourceSettlementId(tenantId, settlementId);
        BigDecimal reversed = BigDecimal.ZERO;
        for (MemberCreditTransaction original : originals) {
            if (original.getReversalOfId() != null) {
                continue;
            }
            reversed = reversed.add(original.getAmount());
            if (creditTxnRepository.existsByTenantIdAndReversalOfId(tenantId, original.getId())) continue;
            String reverseType = "IN".equals(original.getType()) ? "OUT" : "IN";
            recordMovement(memberId, original.getAmount(), reverseType, null, settlementId,
                    original.getSourceDrawId(), original.getId(), original.getChitId(), actorId,
                    "Settlement reversal for credit transaction " + original.getId());
        }
        return reversed;
    }

    private void recordMovement(UUID memberId, BigDecimal amount, String type,
                                UUID batchId, UUID settlementId, UUID drawId, UUID reversalOfId,
                                UUID chitId, UUID actorId, String description) {
        if (amount == null || amount.compareTo(BigDecimal.ZERO) <= 0) return;

        String tenantId = tenantId();
        MemberCreditBalance credit = creditBalanceRepository
                .findByTenantIdAndMemberIdForUpdate(tenantId, memberId)
                .orElseGet(() -> MemberCreditBalance.builder()
                        .tenantId(tenantId)
                        .memberId(memberId)
                        .balance(BigDecimal.ZERO)
                        .build());
        BigDecimal newBalance = "IN".equals(type)
                ? credit.getBalance().add(amount)
                : credit.getBalance().subtract(amount);
        if (newBalance.compareTo(BigDecimal.ZERO) < 0) {
            // Every credit movement must be exact and auditable — never silently clamp
            // a shortfall to zero, since that destroys real money with no ledger trace.
            // Callers are expected to size their consumption against a locked read
            // (getBalanceForUpdate) beforehand; if we still land here, the balance
            // moved out from under the caller (e.g. spent elsewhere since a batch was
            // recorded) and needs a human to reconcile rather than an automatic write-off.
            throw new BusinessException(ErrorCode.CONCURRENT_MODIFICATION,
                    "Credit movement would make member " + memberId + " balance negative (current ₹"
                            + credit.getBalance() + ", requested " + type + " ₹" + amount + ") — "
                            + "the balance changed since it was last read; needs manual reconciliation",
                    HttpStatus.CONFLICT);
        }
        credit.setBalance(newBalance);
        creditBalanceRepository.save(credit);

        creditTxnRepository.save(MemberCreditTransaction.builder()
                .tenantId(tenantId)
                .memberId(memberId)
                .amount(amount)
                .type(type)
                .sourceBatchId(batchId)
                .sourceSettlementId(settlementId)
                .sourceDrawId(drawId)
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
        List<MemberCreditTransaction> txns =
                creditTxnRepository.findByTenantIdAndSourceBatchId(tenantId(), batchId);
        if (txns.isEmpty()) return;

        int reversedCount = 0;
        for (MemberCreditTransaction txn : txns) {
            if (txn.getReversalOfId() != null) {
                continue; // this row is itself a reversal, not an original movement — never re-reverse it
            }
            if (creditTxnRepository.existsByTenantIdAndReversalOfId(tenantId(), txn.getId())) {
                continue; // already reversed — replay-safe
            }
            String reverseType = "IN".equals(txn.getType()) ? "OUT" : "IN";
            recordMovement(memberId, txn.getAmount(), reverseType, batchId, null,
                    txn.getSourceDrawId(), txn.getId(),
                    txn.getChitId(), actorId,
                    "Void reversal for credit transaction " + txn.getId() + " (batch " + batchId + ")");
            reversedCount++;
        }
        log.info("Reversed {} credit transaction(s) for voided batch {} (member {})",
                reversedCount, batchId, memberId);
    }

    /** Reverses every excess-dividend credit created by one auction draw, exactly once. */
    @Transactional
    public void reverseCreditForAuctionDraw(UUID drawId, UUID actorId) {
        String tenantId = tenantId();
        List<MemberCreditTransaction> txns =
                creditTxnRepository.findByTenantIdAndSourceDrawId(tenantId, drawId);
        int reversedCount = 0;
        for (MemberCreditTransaction txn : txns) {
            if (txn.getReversalOfId() != null
                    || creditTxnRepository.existsByTenantIdAndReversalOfId(tenantId, txn.getId())) {
                continue;
            }
            String reverseType = "IN".equals(txn.getType()) ? "OUT" : "IN";
            recordMovement(txn.getMemberId(), txn.getAmount(), reverseType, null, null,
                    drawId, txn.getId(), txn.getChitId(), actorId,
                    "Auction reopen reversal for credit transaction " + txn.getId()
                            + " (draw " + drawId + ")");
            reversedCount++;
        }
        log.info("Reversed {} credit transaction(s) for auction draw {}", reversedCount, drawId);
    }

    private String tenantId() {
        String tenantId = TenantContext.get();
        if (tenantId == null || tenantId.isBlank()) {
            throw new BusinessException(ErrorCode.UNAUTHORIZED,
                    "Organization context is required");
        }
        return tenantId;
    }
}
