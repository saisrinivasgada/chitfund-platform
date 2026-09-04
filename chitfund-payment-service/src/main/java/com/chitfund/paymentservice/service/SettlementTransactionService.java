package com.chitfund.paymentservice.service;

import com.chitfund.paymentservice.domain.Settlement;
import com.chitfund.paymentservice.domain.SettlementChitItem;
import com.chitfund.paymentservice.domain.SettlementPaymentTransaction;
import com.chitfund.paymentservice.domain.enums.AccountType;
import com.chitfund.paymentservice.domain.enums.PaymentMode;
import com.chitfund.paymentservice.domain.enums.SettlementPaymentStatus;
import com.chitfund.paymentservice.domain.enums.TransactionDirection;
import com.chitfund.paymentservice.domain.enums.WalletEntryType;
import com.chitfund.paymentservice.dto.request.AdminWalletEntryRequest;
import com.chitfund.paymentservice.dto.request.RecordSettlementTransactionRequest;
import com.chitfund.paymentservice.dto.response.SettlementResponse;
import com.chitfund.paymentservice.dto.response.SettlementTransactionResponse;
import com.chitfund.paymentservice.repository.SettlementPaymentTransactionRepository;
import com.chitfund.paymentservice.repository.SettlementRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.chitfund.common.context.TenantContext;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

/**
 * Records individual payment transactions against a confirmed Settlement.
 *
 * WHY is payment recording separate from SettlementService.confirm()?
 * confirm() is a one-shot, irreversible business event that freezes the accounting.
 * Payment collection / disbursement happens over time (possibly across multiple days
 * or in multiple cash instalments). Separating concerns keeps confirm() clean and
 * makes the payment flow independently testable.
 *
 * Concurrency strategy:
 *  - findByIdWithLock() acquires a DB-level pessimistic write lock on the Settlement row.
 *  - This prevents two concurrent requests from both reading the same collectedAmount,
 *    each adding their portion, and one losing the update.
 *  - The idempotency key prevents the same transaction from being double-recorded on retry.
 *
 * INTERVIEW: "The combination of pessimistic locking + idempotency key covers the two
 * main concurrency hazards: lost-update race (lock) and HTTP retry duplicate (key)."
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class SettlementTransactionService {

    private final SettlementPaymentTransactionRepository transactionRepository;
    private final SettlementRepository settlementRepository;
    private final AdminWalletService adminWalletService;

    /**
     * Records one payment transaction for a confirmed settlement and updates the
     * settlement's running totals + payment status.
     *
     * @param settlementId the settlement being paid
     * @param req          the transaction details (amount, mode, idempotency key, …)
     * @param adminId      the admin recording this transaction
     * @return the saved transaction + updated settlement totals
     */
    @Transactional
    public SettlementTransactionResponse recordTransaction(
            UUID settlementId,
            RecordSettlementTransactionRequest req,
            UUID adminId) {

        // ── 1. Idempotency check ──────────────────────────────────────────────
        // Return the existing record if the client is retrying the same request.
        // We do NOT throw — idempotent endpoints must be retry-safe.
        if (transactionRepository.existsByIdempotencyKey(req.getIdempotencyKey())) {
            log.info("Idempotent retry detected for key={}; returning existing transaction", req.getIdempotencyKey());
            SettlementPaymentTransaction existing = transactionRepository
                    .findByIdempotencyKey(req.getIdempotencyKey())
                    .orElseThrow(); // safe — existsByIdempotencyKey just returned true
            Settlement settlement = existing.getSettlement();
            return toResponse(existing, settlement);
        }

        // ── 2. Load settlement with pessimistic write lock ────────────────────
        Settlement settlement = settlementRepository.findByIdWithLock(settlementId, TenantContext.get())
                .orElseThrow(() -> new IllegalArgumentException("Settlement not found: " + settlementId));

        // ── 3. Status gate — reject if already fully settled ─────────────────
        SettlementPaymentStatus currentStatus = settlement.getPaymentStatus();
        if (currentStatus == SettlementPaymentStatus.FULLY_COLLECTED
                || currentStatus == SettlementPaymentStatus.FULLY_DISBURSED
                || currentStatus == SettlementPaymentStatus.BALANCED) {
            throw new IllegalStateException("Settlement payment is already complete (status=" + currentStatus + ")");
        }

        // ── 4. Determine direction from settlement net amount ─────────────────
        // netAmount > 0 → member owes the fund → COLLECTION
        // netAmount < 0 → fund owes the member → DISBURSEMENT
        BigDecimal netAmount = settlement.getNetAmount();
        TransactionDirection direction = netAmount.compareTo(BigDecimal.ZERO) > 0
                ? TransactionDirection.COLLECTION
                : TransactionDirection.DISBURSEMENT;

        // ── 5. Compute remaining balance ──────────────────────────────────────
        BigDecimal absNet = netAmount.abs();
        BigDecimal alreadyMoved = direction == TransactionDirection.COLLECTION
                ? settlement.getCollectedAmount()
                : settlement.getDisbursedAmount();
        BigDecimal remaining = absNet.subtract(alreadyMoved);

        // ── 6. Overpayment guard ──────────────────────────────────────────────
        if (req.getAmount().compareTo(remaining) > 0) {
            throw new IllegalArgumentException(
                    "Amount ₹" + req.getAmount().toPlainString()
                    + " exceeds remaining balance of ₹" + remaining.toPlainString());
        }

        // ── 7. Create and save transaction ────────────────────────────────────
        SettlementPaymentTransaction txn = SettlementPaymentTransaction.builder()
                .settlement(settlement)
                .amount(req.getAmount())
                .mode(req.getMode())
                .direction(direction)
                .referenceNumber(req.getReferenceNumber())
                .notes(req.getNotes())
                .recordedBy(adminId)
                .recordedAt(LocalDateTime.now())
                .idempotencyKey(req.getIdempotencyKey())
                .build();
        transactionRepository.save(txn);

        // ── 8. Update settlement running totals and payment status ────────────
        if (direction == TransactionDirection.COLLECTION) {
            BigDecimal newCollected = settlement.getCollectedAmount().add(req.getAmount());
            settlement.setCollectedAmount(newCollected);
            settlement.setPaymentStatus(
                    newCollected.compareTo(absNet) >= 0
                            ? SettlementPaymentStatus.FULLY_COLLECTED
                            : SettlementPaymentStatus.PARTIALLY_COLLECTED);
        } else {
            BigDecimal newDisbursed = settlement.getDisbursedAmount().add(req.getAmount());
            settlement.setDisbursedAmount(newDisbursed);
            settlement.setPaymentStatus(
                    newDisbursed.compareTo(absNet) >= 0
                            ? SettlementPaymentStatus.FULLY_DISBURSED
                            : SettlementPaymentStatus.PARTIALLY_DISBURSED);
        }
        settlementRepository.save(settlement);

        // ── 9. Treasury wallet entry ──────────────────────────────────────────
        // Mode determines which account (CASH → cash drawer; everything else → bank).
        // Direction determines flow direction (COLLECTION → IN; DISBURSEMENT → OUT).
        AccountType accountType = req.getMode() == PaymentMode.CASH
                ? AccountType.CASH
                : AccountType.BANK;
        WalletEntryType entryType = direction == TransactionDirection.COLLECTION
                ? WalletEntryType.IN
                : WalletEntryType.OUT;

        String description = direction == TransactionDirection.COLLECTION
                ? "Settlement payment collected — member " + settlement.getMemberId()
                  + " settlement " + settlementId
                  + " ₹" + req.getAmount().toPlainString()
                : "Settlement refund disbursed — member " + settlement.getMemberId()
                  + " settlement " + settlementId
                  + " ₹" + req.getAmount().toPlainString();

        AdminWalletEntryRequest walletReq = new AdminWalletEntryRequest();
        walletReq.setAccountType(accountType);
        walletReq.setEntryType(entryType);
        walletReq.setAmount(req.getAmount());
        walletReq.setCategory("SETTLEMENT_PAYMENT");
        walletReq.setDescription(description);
        walletReq.setReferenceId(txn.getId()); // payment transaction ID for direct receipt lookup
        adminWalletService.addEntry(walletReq, adminId, TenantContext.get());

        log.info("Settlement transaction recorded: settlementId={} direction={} amount={} mode={} status={}",
                settlementId, direction, req.getAmount(), req.getMode(), settlement.getPaymentStatus());

        return toResponse(txn, settlement);
    }

    /**
     * Returns all payment transactions for a settlement, ordered oldest-first.
     * Used to display the payment timeline on the settlement detail screen.
     */
    @Transactional(readOnly = true)
    public List<SettlementTransactionResponse> getTransactions(UUID settlementId) {
        // Verify settlement exists
        Settlement settlement = settlementRepository.findById(settlementId)
                .orElseThrow(() -> new IllegalArgumentException("Settlement not found: " + settlementId));

        return transactionRepository
                .findBySettlement_IdOrderByCreatedAtAsc(settlementId)
                .stream()
                .map(txn -> toResponse(txn, settlement))
                .toList();
    }

    /**
     * Returns paginated settlements that still have an outstanding payment obligation,
     * scoped to the current tenant.
     * Excludes FULLY_COLLECTED, FULLY_DISBURSED, BALANCED (all terminal statuses).
     *
     * WHY return SettlementResponse and not Settlement?
     * open-in-view is disabled; the JPA session closes when this method returns.
     * Returning the raw entity would cause LazyInitializationException when Jackson
     * tries to serialize the lazy chitItems collection. Mapping inside the transaction
     * prevents that.
     */
    @Transactional(readOnly = true)
    public Page<SettlementResponse> getPendingSettlements(Pageable pageable) {
        List<SettlementPaymentStatus> terminal = List.of(
                SettlementPaymentStatus.FULLY_COLLECTED,
                SettlementPaymentStatus.FULLY_DISBURSED,
                SettlementPaymentStatus.BALANCED,
                SettlementPaymentStatus.VOIDED);
        return settlementRepository.findPendingByTenant(TenantContext.get(), terminal, pageable)
                .map(this::toPendingResponse);
    }

    private SettlementResponse toPendingResponse(Settlement s) {
        BigDecimal absNet = s.getNetAmount().abs();
        BigDecimal moved = s.getNetAmount().compareTo(BigDecimal.ZERO) > 0
                ? s.getCollectedAmount()
                : s.getDisbursedAmount();
        BigDecimal remaining = absNet.subtract(moved).max(BigDecimal.ZERO);
        return SettlementResponse.builder()
                .id(s.getId())
                .memberId(s.getMemberId())
                .settledBy(s.getSettledBy())
                .settledAt(s.getSettledAt())
                .totalOwed(s.getTotalOwed())
                .totalRefunded(s.getTotalRefunded())
                .netAmount(s.getNetAmount())
                .notes(s.getNotes())
                .adjustmentAmount(s.getAdjustmentAmount())
                .adjustmentReason(s.getAdjustmentReason())
                .paymentStatus(s.getPaymentStatus())
                .collectedAmount(s.getCollectedAmount())
                .disbursedAmount(s.getDisbursedAmount())
                .remainingAmount(remaining)
                .createdAt(s.getCreatedAt())
                .chitItems(s.getChitItems().stream()
                        .map(item -> SettlementResponse.ChitItemDetail.builder()
                                .id(item.getId())
                                .chitId(item.getChitId())
                                .chitName(item.getChitName())
                                .settlementCase(item.getSettlementCase())
                                .settlementMode(item.getSettlementMode())
                                .payoutStatus(item.getPayoutStatus())
                                .disbursedAmount(item.getDisbursedAmount())
                                .netPayoutAmount(item.getNetPayoutAmount())
                                .unpaidDues(item.getUnpaidDues())
                                .futureInstallments(item.getFutureInstallments())
                                .payoutCredit(item.getPayoutCredit())
                                .totalPaid(item.getTotalPaid())
                                .netAmount(item.getNetAmount())
                                .description(item.getDescription())
                                .build())
                        .toList())
                .build();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Mapping
    // ─────────────────────────────────────────────────────────────────────────

    private SettlementTransactionResponse toResponse(
            SettlementPaymentTransaction txn, Settlement settlement) {

        BigDecimal absNet = settlement.getNetAmount().abs();
        BigDecimal moved = txn.getDirection() == TransactionDirection.COLLECTION
                ? settlement.getCollectedAmount()
                : settlement.getDisbursedAmount();
        BigDecimal remaining = absNet.subtract(moved).max(BigDecimal.ZERO);

        return SettlementTransactionResponse.builder()
                .id(txn.getId())
                .settlementId(settlement.getId())
                .amount(txn.getAmount())
                .mode(txn.getMode())
                .direction(txn.getDirection())
                .referenceNumber(txn.getReferenceNumber())
                .notes(txn.getNotes())
                .recordedBy(txn.getRecordedBy())
                .recordedAt(txn.getRecordedAt())
                .createdAt(txn.getCreatedAt())
                .idempotencyKey(txn.getIdempotencyKey())
                .collectedAmount(settlement.getCollectedAmount())
                .disbursedAmount(settlement.getDisbursedAmount())
                .remainingAmount(remaining)
                .paymentStatus(settlement.getPaymentStatus())
                .settlementNetAmount(settlement.getNetAmount())
                .build();
    }
}
