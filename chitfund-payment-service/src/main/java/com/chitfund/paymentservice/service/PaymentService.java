package com.chitfund.paymentservice.service;

import com.chitfund.common.event.CashCollectedEvent;
import com.chitfund.common.event.PaymentCompletedEvent;
import com.chitfund.common.exception.BusinessException;
import com.chitfund.common.exception.ErrorCode;
import com.chitfund.paymentservice.domain.PaymentAllocation;
import com.chitfund.paymentservice.domain.PaymentBatch;
import com.chitfund.paymentservice.domain.PaymentRecord;
import com.chitfund.paymentservice.domain.enums.BatchStatus;
import com.chitfund.paymentservice.domain.enums.PaymentMode;
import com.chitfund.paymentservice.domain.enums.PaymentRecordStatus;
import com.chitfund.paymentservice.domain.enums.AccountType;
import com.chitfund.paymentservice.domain.enums.NotificationType;
import com.chitfund.paymentservice.domain.enums.WalletEntryType;
import com.chitfund.paymentservice.dto.request.AdminWalletEntryRequest;
import com.chitfund.paymentservice.dto.request.CollectCashRequest;
import com.chitfund.paymentservice.dto.request.RecordPaymentRequest;
import com.chitfund.paymentservice.dto.request.VoidPaymentRequest;
import com.chitfund.paymentservice.dto.response.MemberBalanceResponse;
import com.chitfund.paymentservice.dto.response.PaymentBatchResponse;
import com.chitfund.paymentservice.dto.response.PaymentRecordResponse;
import com.chitfund.paymentservice.client.MemberServiceClient;
import com.chitfund.paymentservice.kafka.PaymentEventPublisher;
import com.chitfund.paymentservice.repository.PaymentAllocationRepository;
import com.chitfund.paymentservice.repository.PaymentBatchRepository;
import com.chitfund.paymentservice.repository.PaymentRecordRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class PaymentService {

    private final PaymentBatchRepository batchRepository;
    private final PaymentRecordRepository paymentRecordRepository;
    private final PaymentAllocationRepository allocationRepository;
    private final PaymentEventPublisher eventPublisher;
    private final MemberServiceClient memberServiceClient;
    private final AdminWalletService adminWalletService;
    private final NotificationService notificationService;
    private final MemberCreditService memberCreditService;
    private final ChitMonthDrawService chitMonthDrawService;

    /**
     * Step 1 of the cash flow: worker/manager records collection from a member.
     * Money is physically with the collector — FIFO is NOT applied yet.
     * Admin must call remitCash() after receiving from the worker/manager.
     *
     * Exception: if the caller is ADMIN and has no overrideCollectedBy, they collected
     * the cash themselves and are already the treasury keeper — complete immediately.
     */
    @Transactional
    public PaymentBatchResponse collectCash(CollectCashRequest request, UUID workerId, boolean callerIsAdmin) {
        if (!memberServiceClient.isMemberActive(request.getMemberId())
                && !paymentRecordRepository.existsByMemberIdAndChitId(request.getMemberId(), request.getChitId())) {
            throw new BusinessException(ErrorCode.MEMBER_INACTIVE,
                    "Member " + request.getMemberId() + " is not active");
        }

        UUID effectiveCollector = request.getOverrideCollectedBy() != null
                ? request.getOverrideCollectedBy() : workerId;

        boolean adminSelfCollect = callerIsAdmin && request.getOverrideCollectedBy() == null;

        PaymentBatch batch = PaymentBatch.builder()
                .chitId(request.getChitId())
                .memberId(request.getMemberId())
                .totalAmount(request.getAmount())
                .paymentMode(PaymentMode.CASH)
                .status(adminSelfCollect ? BatchStatus.COMPLETED : BatchStatus.AWAITING_REMITTANCE)
                .collectedBy(effectiveCollector)
                .collectedAt(LocalDateTime.now())
                .notes(request.getNotes())
                .build();
        batchRepository.save(batch);

        if (adminSelfCollect) {
            List<PaymentAllocation> allocations = applyFifo(batch, workerId);
            log.info("Admin {} collected ₹{} cash directly from member {} for chit {} — completed immediately",
                    workerId, request.getAmount(), request.getMemberId(), request.getChitId());
            creditWallet(batch, workerId);
            eventPublisher.publish(buildCompletedEvent(batch, workerId));
            return toBatchResponse(batch, allocations);
        }

        log.info("Collector {} collected ₹{} cash from member {} for chit {} — awaiting remittance",
                effectiveCollector, request.getAmount(), request.getMemberId(), request.getChitId());

        eventPublisher.publish(new CashCollectedEvent(
                batch.getId().toString(),
                request.getChitId().toString(),
                request.getMemberId().toString(),
                request.getAmount(),
                workerId.toString(),
                Instant.now()
        ));

        return toBatchResponse(batch, List.of());
    }

    /**
     * For non-cash payments (UPI, BANK_TRANSFER, CHEQUE).
     * Admin records directly — completed immediately, FIFO applied now.
     */
    @Transactional
    public PaymentBatchResponse recordPayment(RecordPaymentRequest request, UUID adminId) {
        if (!memberServiceClient.isMemberActive(request.getMemberId())
                && !paymentRecordRepository.existsByMemberIdAndChitId(request.getMemberId(), request.getChitId())) {
            throw new BusinessException(ErrorCode.MEMBER_INACTIVE,
                    "Member " + request.getMemberId() + " is not active");
        }

        // CASH via this endpoint = admin collected directly (COMPLETED immediately, no remittance step)
        // Worker-collected CASH still goes through POST /payments/collect → AWAITING_REMITTANCE
        PaymentBatch batch = PaymentBatch.builder()
                .chitId(request.getChitId())
                .memberId(request.getMemberId())
                .totalAmount(request.getAmount())
                .paymentMode(request.getPaymentMode())
                .status(BatchStatus.COMPLETED)
                .notes(request.getNotes())
                .collectedAt(request.getPaymentMode() == PaymentMode.CASH ? LocalDateTime.now() : null)
                .collectedBy(request.getPaymentMode() == PaymentMode.CASH ? adminId : null)
                .recordedBy(adminId)
                .build();
        batchRepository.save(batch);

        List<PaymentAllocation> allocations = applyFifo(batch, adminId);

        log.info("Admin {} recorded {} payment of ₹{} for member {} in chit {} — {} months updated",
                adminId, request.getPaymentMode(), request.getAmount(),
                request.getMemberId(), request.getChitId(), allocations.size());

        creditWallet(batch, adminId);
        notificationService.notifyUser(batch.getMemberId(), NotificationType.PAYMENT_COMPLETED,
                "Payment Recorded",
                String.format("Your %s payment of ₹%s has been recorded and credited to your account.",
                        request.getPaymentMode().toString().replace("_", " "),
                        request.getAmount().toPlainString()),
                "PAYMENT", batch.getId(), "/member");
        eventPublisher.publish(buildCompletedEvent(batch, adminId));

        return toBatchResponse(batch, allocations);
    }

    /**
     * Step 2 of the cash flow: admin confirms they received the cash from the worker.
     * FIFO is applied here — payment_records are updated only after admin confirmation.
     *
     * WHY apply FIFO only at remittance, not at collection?
     * Until admin physically receives the money, it's the worker's responsibility.
     * If a worker loses the cash before remitting, we haven't credited the member yet.
     * This keeps accounting accurate — credit follows actual receipt.
     */
    @Transactional
    public PaymentBatchResponse remitCash(UUID batchId, UUID adminId) {
        PaymentBatch batch = batchRepository.findById(batchId)
                .orElseThrow(() -> new BusinessException(ErrorCode.PAYMENT_NOT_FOUND,
                        "Payment batch not found: " + batchId));

        if (batch.getStatus() != BatchStatus.AWAITING_REMITTANCE) {
            throw new BusinessException(ErrorCode.BATCH_ALREADY_COMPLETED,
                    "This payment has already been completed");
        }

        batch.setStatus(BatchStatus.COMPLETED);
        batch.setRemittedAt(LocalDateTime.now());
        batch.setRemittedBy(adminId);
        batchRepository.save(batch);

        List<PaymentAllocation> allocations = applyFifo(batch, adminId);

        log.info("Admin {} remitted cash batch {} (₹{}) for member {} — {} months updated",
                adminId, batchId, batch.getTotalAmount(), batch.getMemberId(), allocations.size());

        creditWallet(batch, adminId);
        notificationService.notifyUser(batch.getMemberId(), NotificationType.PAYMENT_COMPLETED,
                "Payment Confirmed",
                String.format("Your cash payment of ₹%s has been received and credited to your account.",
                        batch.getTotalAmount().toPlainString()),
                "PAYMENT", batchId, "/member");
        eventPublisher.publish(buildCompletedEvent(batch, adminId));

        return toBatchResponse(batch, allocations);
    }

    /**
     * Reverses a COMPLETED batch: subtracts each allocation from the payment record's amountPaid,
     * recomputes the record's status, then marks the batch VOIDED.
     * AWAITING_REMITTANCE batches can also be voided — no FIFO was applied so no records need reversal.
     */
    @Transactional
    public PaymentBatchResponse voidPayment(UUID batchId, VoidPaymentRequest request, UUID adminId) {
        PaymentBatch batch = batchRepository.findById(batchId)
                .orElseThrow(() -> new BusinessException(ErrorCode.PAYMENT_NOT_FOUND,
                        "Payment batch not found: " + batchId));

        if (batch.getStatus() == BatchStatus.VOIDED) {
            throw new BusinessException(ErrorCode.BATCH_ALREADY_COMPLETED,
                    "This batch is already voided");
        }

        List<PaymentAllocation> allocations = allocationRepository.findByBatchId(batchId);

        for (PaymentAllocation alloc : allocations) {
            PaymentRecord record = paymentRecordRepository.findById(alloc.getPaymentRecordId())
                    .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND,
                            "Payment record not found: " + alloc.getPaymentRecordId()));

            BigDecimal newPaid = record.getAmountPaid().subtract(alloc.getAllocatedAmount());
            if (newPaid.compareTo(BigDecimal.ZERO) < 0) newPaid = BigDecimal.ZERO;
            record.setAmountPaid(newPaid);

            if (newPaid.compareTo(BigDecimal.ZERO) == 0) {
                record.setStatus(PaymentRecordStatus.OUTSTANDING);
            } else if (newPaid.compareTo(record.getAmountDue()) < 0) {
                record.setStatus(PaymentRecordStatus.PARTIALLY_PAID);
            } else {
                record.setStatus(PaymentRecordStatus.SETTLED);
            }
            paymentRecordRepository.save(record);
        }

        boolean wasCompleted = batch.getStatus() == BatchStatus.COMPLETED;

        batch.setStatus(BatchStatus.VOIDED);
        batch.setVoidedAt(LocalDateTime.now());
        batch.setVoidedBy(adminId);
        batch.setVoidReason(request.getReason());
        batchRepository.save(batch);

        // Re-open any draws that were auto-closed by this batch and are now unsettled again.
        allocations.stream()
                .collect(java.util.stream.Collectors.groupingBy(
                        a -> a.getChitId().toString() + ":" + a.getMonthNumber()))
                .forEach((key, allocs) -> {
                    PaymentAllocation first = allocs.get(0);
                    try {
                        chitMonthDrawService.autoReopenIfNotFullySettled(first.getChitId(), first.getMonthNumber());
                    } catch (Exception e) {
                        log.warn("Auto-reopen check failed for chit {} month {} — {}",
                                first.getChitId(), first.getMonthNumber(), e.getMessage());
                    }
                });

        // Reverse any credit movements this batch caused (auto-consumed credit or overpayment credit).
        // This runs regardless of batch status — credit can be affected even before remittance.
        memberCreditService.reverseCreditForVoidedBatch(batchId, batch.getMemberId(), adminId);

        // Reverse treasury credit only if the batch was already COMPLETED
        // (AWAITING_REMITTANCE batches were never credited, so nothing to reverse)
        if (wasCompleted) {
            AccountType accountType = batch.getPaymentMode() == PaymentMode.CASH
                    ? AccountType.CASH : AccountType.BANK;
            AdminWalletEntryRequest debit = new AdminWalletEntryRequest();
            debit.setAccountType(accountType);
            debit.setEntryType(WalletEntryType.OUT);
            debit.setAmount(batch.getTotalAmount());
            debit.setCategory("PAYMENT_VOID");
            debit.setDescription("Reversal of payment batch " + batchId + " — " + request.getReason());
            adminWalletService.addEntry(debit, adminId);
        }

        log.info("Admin {} voided batch {} (₹{}) for member {} — reason: {}",
                adminId, batchId, batch.getTotalAmount(), batch.getMemberId(), request.getReason());

        return toBatchResponse(batch, allocations);
    }

    /**
     * Marks a specific month's payment record as PAYOUT_DEDUCTED — the installment was
     * withheld from the winner's payout. No batch, no treasury movement. amountPaid is set to
     * amountDue so the draw card shows balance = 0. settledByPayoutId links back for reversal.
     *
     * Idempotent: safe to call even if already PAYOUT_DEDUCTED or SETTLED.
     */
    @Transactional
    public void markPayoutDeducted(UUID chitId, UUID memberId, int monthNumber, UUID payoutId) {
        paymentRecordRepository.findByChitIdAndMemberIdAndMonthNumber(chitId, memberId, monthNumber)
                .ifPresent(record -> {
                    if (record.getStatus() == PaymentRecordStatus.SETTLED
                            || record.getStatus() == PaymentRecordStatus.PAYOUT_DEDUCTED) return;
                    record.setAmountPaid(record.getAmountDue());
                    record.setStatus(PaymentRecordStatus.PAYOUT_DEDUCTED);
                    record.setSettledByPayoutId(payoutId);
                    paymentRecordRepository.save(record);
                    log.info("Marked payment record ({}/{}/{}) as PAYOUT_DEDUCTED for payout {}",
                            chitId, memberId, monthNumber, payoutId);
                });
        chitMonthDrawService.autoCloseIfAllSettled(chitId, monthNumber);
    }

    /**
     * Clears cross-chit dues withheld from a payout using FIFO — oldest outstanding month first.
     * Fully cleared months get PAYOUT_DEDUCTED. If the amount runs out mid-month, that
     * month stays PARTIALLY_PAID (no settledByPayoutId link — cannot be auto-reverted).
     * No batch, no treasury movement.
     */
    @Transactional
    public void markCrossChitDisbursementSettled(UUID chitId, UUID memberId, BigDecimal amount, UUID payoutId) {
        List<PaymentRecord> records = paymentRecordRepository
                .findByMemberIdAndChitIdAndStatusInOrderByMonthNumberAsc(
                        memberId, chitId,
                        List.of(PaymentRecordStatus.OUTSTANDING, PaymentRecordStatus.PARTIALLY_PAID));

        BigDecimal remaining = amount;
        for (PaymentRecord record : records) {
            if (remaining.compareTo(BigDecimal.ZERO) <= 0) break;
            BigDecimal owed = record.getAmountDue().subtract(record.getAmountPaid());
            if (remaining.compareTo(owed) >= 0) {
                record.setAmountPaid(record.getAmountDue());
                record.setStatus(PaymentRecordStatus.PAYOUT_DEDUCTED);
                record.setSettledByPayoutId(payoutId);
                remaining = remaining.subtract(owed);
            } else {
                record.setAmountPaid(record.getAmountPaid().add(remaining));
                remaining = BigDecimal.ZERO;
            }
            paymentRecordRepository.save(record);
        }
        log.info("Cross-chit PAYOUT_DEDUCTED applied — chit {} member {} ₹{} for payout {}",
                chitId, memberId, amount, payoutId);

        // Auto-close any draw that is now fully settled after these deductions
        records.stream()
                .filter(r -> r.getStatus() == PaymentRecordStatus.PAYOUT_DEDUCTED)
                .map(PaymentRecord::getMonthNumber)
                .distinct()
                .forEach(mn -> {
                    try { chitMonthDrawService.autoCloseIfAllSettled(chitId, mn); }
                    catch (Exception e) { log.warn("Auto-close check failed for chit {} month {} — {}", chitId, mn, e.getMessage()); }
                });
    }

    /**
     * Reverses all PAYOUT_DEDUCTED records linked to a payout (across all chits).
     * Called when a payout is cancelled or its draw is deleted.
     */
    @Transactional
    public void revertPayoutDeductions(UUID payoutId) {
        List<PaymentRecord> records = paymentRecordRepository.findBySettledByPayoutId(payoutId);
        List<PaymentRecord> reverted = new java.util.ArrayList<>();
        for (PaymentRecord r : records) {
            if (r.getStatus() != PaymentRecordStatus.PAYOUT_DEDUCTED) continue;
            // Re-derive how much was actually paid via cash/UPI before the payout withheld the rest.
            // Sum allocations from COMPLETED (non-voided) batches only — voided batches were already
            // reversed and their amount was subtracted from amountPaid at void time.
            BigDecimal cashPaid = allocationRepository.findByPaymentRecordId(r.getId()).stream()
                    .filter(a -> {
                        PaymentBatch b = batchRepository.findById(a.getBatchId()).orElse(null);
                        return b != null && b.getStatus() == BatchStatus.COMPLETED;
                    })
                    .map(PaymentAllocation::getAllocatedAmount)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
            r.setAmountPaid(cashPaid);
            r.setStatus(cashPaid.compareTo(BigDecimal.ZERO) == 0
                    ? PaymentRecordStatus.OUTSTANDING
                    : PaymentRecordStatus.PARTIALLY_PAID);
            r.setSettledByPayoutId(null);
            paymentRecordRepository.save(r);
            reverted.add(r);
        }
        log.info("Reverted {} PAYOUT_DEDUCTED records for payout {}", reverted.size(), payoutId);

        // Reopen any draws that were auto-closed by this payout's deductions
        reverted.stream()
                .collect(java.util.stream.Collectors.groupingBy(
                        r -> r.getChitId().toString() + ":" + r.getMonthNumber()))
                .forEach((key, group) -> {
                    PaymentRecord first = group.get(0);
                    try { chitMonthDrawService.autoReopenIfNotFullySettled(first.getChitId(), first.getMonthNumber()); }
                    catch (Exception e) { log.warn("Auto-reopen check failed for chit {} month {} — {}", first.getChitId(), first.getMonthNumber(), e.getMessage()); }
                });
    }

    @Transactional
    public PaymentRecordResponse updatePromisedDate(UUID recordId, java.time.LocalDate date) {
        PaymentRecord record = paymentRecordRepository.findById(recordId)
                .orElseThrow(() -> new com.chitfund.common.exception.ResourceNotFoundException("PaymentRecord", recordId));
        record.setPromisedPaymentDate(date);
        paymentRecordRepository.save(record);
        LocalDate today = LocalDate.now();
        return PaymentRecordResponse.builder()
                .id(record.getId())
                .chitId(record.getChitId())
                .memberId(record.getMemberId())
                .monthNumber(record.getMonthNumber())
                .dueDate(record.getDueDate())
                .amountDue(record.getAmountDue())
                .amountPaid(record.getAmountPaid())
                .balance(record.getAmountDue().subtract(record.getAmountPaid()))
                .status(record.getStatus())
                .overdue((record.getStatus() == PaymentRecordStatus.OUTSTANDING
                        || record.getStatus() == PaymentRecordStatus.PARTIALLY_PAID)
                        && record.getDueDate().isBefore(today))
                .promisedPaymentDate(record.getPromisedPaymentDate())
                .createdAt(record.getCreatedAt())
                .updatedAt(record.getUpdatedAt())
                .build();
    }

    @Transactional(readOnly = true)
    public List<PaymentBatchResponse> getPaymentBatches(UUID memberId, UUID chitId) {
        // Primary batches: recorded directly for this chit
        List<PaymentBatch> primary = batchRepository.findByMemberIdAndChitIdOrderByCreatedAtDesc(memberId, chitId);
        Set<UUID> seen = new HashSet<>();
        primary.forEach(b -> seen.add(b.getId()));

        // Cross-chit batches: recorded for another chit but have allocations that spilled into this one
        List<UUID> allBatchIds = allocationRepository.findBatchIdsWithAllocationsForChit(memberId, chitId);
        List<PaymentBatch> crossChit = allBatchIds.stream()
                .filter(id -> !seen.contains(id))
                .map(id -> batchRepository.findById(id).orElse(null))
                .filter(java.util.Objects::nonNull)
                .sorted(java.util.Comparator.comparing(PaymentBatch::getCreatedAt).reversed())
                .toList();

        List<PaymentBatchResponse> result = new ArrayList<>();
        primary.forEach(b -> result.add(toBatchResponse(b, allocationRepository.findByBatchId(b.getId()))));
        crossChit.forEach(b -> result.add(toBatchResponse(b, allocationRepository.findByBatchId(b.getId()))));

        result.sort(java.util.Comparator.comparing(PaymentBatchResponse::getCreatedAt,
                java.util.Comparator.nullsLast(java.util.Comparator.reverseOrder())));
        return result;
    }

    @Transactional(readOnly = true)
    public PaymentBatchResponse getBatchById(UUID batchId) {
        PaymentBatch batch = batchRepository.findById(batchId)
                .orElseThrow(() -> new BusinessException(ErrorCode.PAYMENT_NOT_FOUND, "Batch not found: " + batchId));
        return toBatchResponse(batch, allocationRepository.findByBatchId(batchId));
    }

    /**
     * Auto-credit treasury when a payment is fully settled.
     * CASH → AccountType.CASH; UPI / BANK_TRANSFER / CHEQUE → AccountType.BANK
     */
    private void creditWallet(PaymentBatch batch, UUID actorId) {
        AccountType accountType = batch.getPaymentMode() == PaymentMode.CASH
                ? AccountType.CASH : AccountType.BANK;
        AdminWalletEntryRequest entry = new AdminWalletEntryRequest();
        entry.setAccountType(accountType);
        entry.setEntryType(WalletEntryType.IN);
        entry.setAmount(batch.getTotalAmount());
        entry.setCategory("PAYMENT");
        entry.setDescription("Payment received — member " + batch.getMemberId() + ", chit " + batch.getChitId());
        adminWalletService.addEntry(entry, actorId);
    }

    /**
     * FIFO debt application with cross-chit spillover and global credit balance.
     *
     * Step 1 — Auto-consume member's global credit balance first (oldest credit applied first).
     *   Example: member has ₹500 credit → effective amount = ₹4,500 payment + ₹500 credit = ₹5,000.
     *
     * Step 2 — FIFO within the current chit (oldest month first).
     *
     * Step 3 — If amount remains after current chit is clear → spill into OTHER chits.
     *   Records across other chits are ordered by dueDate so the genuinely oldest debt
     *   clears first, regardless of which chit it belongs to.
     *   WHY: member credit should only exist when they owe NOTHING anywhere.
     *   A member who overpaid Chit 1 but still owes Chit 2 has no real "credit" —
     *   the excess belongs to Chit 2. The allocation tracks the actual chit so void
     *   can reverse it correctly.
     *
     * Step 4 — Only if all chits are clear → excess goes to credit balance.
     */
    private List<PaymentAllocation> applyFifo(PaymentBatch batch, UUID actorId) {
        List<PaymentRecordStatus> pendingStatuses =
                List.of(PaymentRecordStatus.OUTSTANDING, PaymentRecordStatus.PARTIALLY_PAID);

        // Step 1: Auto-consume credit up to what member owes across ALL chits
        BigDecimal totalOwedAllChits = paymentRecordRepository
                .findTotalOutstandingByMemberId(batch.getMemberId(), pendingStatuses);
        BigDecimal creditAvailable = memberCreditService.getBalance(batch.getMemberId());
        BigDecimal creditToUse = creditAvailable.min(totalOwedAllChits);

        if (creditToUse.compareTo(BigDecimal.ZERO) > 0) {
            memberCreditService.consumeCredit(
                    batch.getMemberId(), creditToUse, batch.getId(), batch.getChitId(), actorId,
                    "Auto-applied to outstanding (credit consumed for payment batch " + batch.getId() + ")");
        }

        BigDecimal remaining = batch.getTotalAmount().add(creditToUse);
        List<PaymentAllocation> allocations = new ArrayList<>();

        // Step 2: FIFO within the current chit
        List<PaymentRecord> sameChit = paymentRecordRepository
                .findByMemberIdAndChitIdAndStatusInOrderByMonthNumberAsc(
                        batch.getMemberId(), batch.getChitId(), pendingStatuses);

        remaining = applyToRecords(sameChit, remaining, batch.getId(), allocations);

        // Step 3: Spill into other chits (ordered by dueDate ascending — oldest debt first)
        if (remaining.compareTo(BigDecimal.ZERO) > 0) {
            List<PaymentRecord> otherChits = paymentRecordRepository
                    .findOutstandingAcrossOtherChits(batch.getMemberId(), batch.getChitId(), pendingStatuses);
            if (!otherChits.isEmpty()) {
                log.info("Batch {} — ₹{} spills across {} other-chit record(s) for member {}",
                        batch.getId(), remaining, otherChits.size(), batch.getMemberId());
                remaining = applyToRecords(otherChits, remaining, batch.getId(), allocations);
            }
        }

        // Step 4: All chits fully cleared → any remaining is true credit
        if (remaining.compareTo(BigDecimal.ZERO) > 0) {
            memberCreditService.addCredit(
                    batch.getMemberId(), remaining, batch.getId(), batch.getChitId(), actorId,
                    "Overpayment — no outstanding across any chit, ₹" + remaining + " added as credit");
            log.info("Batch {} — ₹{} added to member {} credit (all chits clear)",
                    batch.getId(), remaining, batch.getMemberId());
        }

        // Step 5: For every (chitId, monthNumber) that received a payment, check if the draw
        // is now fully settled and auto-close it if so.
        allocations.stream()
                .collect(java.util.stream.Collectors.groupingBy(
                        a -> a.getChitId().toString() + ":" + a.getMonthNumber()))
                .forEach((key, allocs) -> {
                    PaymentAllocation first = allocs.get(0);
                    try {
                        chitMonthDrawService.autoCloseIfAllSettled(first.getChitId(), first.getMonthNumber());
                    } catch (Exception e) {
                        log.warn("Auto-close check failed for chit {} month {} — {}",
                                first.getChitId(), first.getMonthNumber(), e.getMessage());
                    }
                });

        return allocations;
    }

    // Shared FIFO applicator — updates records in-place, appends to allocations list, returns remainder.
    private BigDecimal applyToRecords(List<PaymentRecord> records, BigDecimal remaining,
                                      UUID batchId, List<PaymentAllocation> allocations) {
        for (PaymentRecord record : records) {
            if (remaining.compareTo(BigDecimal.ZERO) <= 0) break;

            BigDecimal owed     = record.getAmountDue().subtract(record.getAmountPaid());
            BigDecimal applying = remaining.min(owed);

            PaymentAllocation alloc = PaymentAllocation.builder()
                    .batchId(batchId)
                    .paymentRecordId(record.getId())
                    .chitId(record.getChitId())       // actual chit of the record, may differ from batch
                    .memberId(record.getMemberId())
                    .monthNumber(record.getMonthNumber())
                    .allocatedAmount(applying)
                    .build();
            allocationRepository.save(alloc);
            allocations.add(alloc);

            record.setAmountPaid(record.getAmountPaid().add(applying));
            record.setStatus(record.getAmountPaid().compareTo(record.getAmountDue()) >= 0
                    ? PaymentRecordStatus.SETTLED
                    : PaymentRecordStatus.PARTIALLY_PAID);
            paymentRecordRepository.save(record);

            remaining = remaining.subtract(applying);
        }
        return remaining;
    }

    @Transactional(readOnly = true)
    public com.chitfund.paymentservice.dto.response.MemberCreditResponse getMemberCredit(UUID memberId) {
        return memberCreditService.getCreditDetails(memberId);
    }

    @Transactional(readOnly = true)
    public MemberBalanceResponse getMemberBalance(UUID memberId, UUID chitId) {
        List<PaymentRecord> nonSettled = paymentRecordRepository
                .findByMemberIdAndChitIdAndStatusInOrderByMonthNumberAsc(
                        memberId, chitId,
                        List.of(PaymentRecordStatus.OUTSTANDING, PaymentRecordStatus.PARTIALLY_PAID));

        BigDecimal totalOutstanding = nonSettled.stream()
                .map(r -> r.getAmountDue().subtract(r.getAmountPaid()))
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        List<MemberBalanceResponse.MonthBalance> months = nonSettled.stream()
                .map(r -> MemberBalanceResponse.MonthBalance.builder()
                        .monthNumber(r.getMonthNumber())
                        .dueDate(r.getDueDate())
                        .amountDue(r.getAmountDue())
                        .amountPaid(r.getAmountPaid())
                        .balance(r.getAmountDue().subtract(r.getAmountPaid()))
                        .status(r.getStatus())
                        .build())
                .toList();

        return MemberBalanceResponse.builder()
                .memberId(memberId)
                .chitId(chitId)
                .totalOutstanding(totalOutstanding)
                .months(months)
                .build();
    }

    @Transactional(readOnly = true)
    public List<PaymentRecordResponse> getPaymentHistory(UUID memberId, UUID chitId) {
        List<PaymentRecord> records = paymentRecordRepository
                .findByMemberIdAndChitIdOrderByMonthNumberAsc(memberId, chitId);
        LocalDate today = LocalDate.now();
        return records.stream()
                .map(r -> PaymentRecordResponse.builder()
                        .id(r.getId())
                        .chitId(r.getChitId())
                        .memberId(r.getMemberId())
                        .monthNumber(r.getMonthNumber())
                        .dueDate(r.getDueDate())
                        .amountDue(r.getAmountDue())
                        .amountPaid(r.getAmountPaid())
                        .balance(r.getAmountDue().subtract(r.getAmountPaid()))
                        .status(r.getStatus())
                        .overdue((r.getStatus() == PaymentRecordStatus.OUTSTANDING
                                || r.getStatus() == PaymentRecordStatus.PARTIALLY_PAID)
                                && r.getDueDate().isBefore(today))
                        .promisedPaymentDate(r.getPromisedPaymentDate())
                        .createdAt(r.getCreatedAt())
                        .updatedAt(r.getUpdatedAt())
                        .build())
                .toList();
    }

    @Transactional(readOnly = true)
    public List<PaymentBatchResponse> getAllBatches(UUID chitId, UUID memberId, LocalDate fromDate, LocalDate toDate) {
        List<PaymentBatch> batches;
        if (fromDate != null || toDate != null) {
            LocalDateTime start = fromDate != null ? fromDate.atStartOfDay() : LocalDate.of(2000, 1, 1).atStartOfDay();
            LocalDateTime end   = toDate   != null ? toDate.plusDays(1).atStartOfDay() : LocalDate.now().plusDays(1).atStartOfDay();
            batches = batchRepository.findByDateRange(start, end, chitId, memberId);
        } else if (chitId != null && memberId != null) {
            batches = batchRepository.findByChitIdAndMemberIdOrderByCreatedAtDesc(chitId, memberId);
        } else if (chitId != null) {
            batches = batchRepository.findByChitIdOrderByCreatedAtDesc(chitId);
        } else if (memberId != null) {
            batches = batchRepository.findByMemberIdOrderByCreatedAtDesc(memberId);
        } else {
            batches = batchRepository.findAllByOrderByCreatedAtDesc();
        }
        return batches.stream()
                .map(batch -> {
                    List<PaymentAllocation> allocs = allocationRepository.findByBatchId(batch.getId());
                    return toBatchResponse(batch, allocs);
                })
                .toList();
    }

    @Transactional(readOnly = true)
    public List<PaymentBatchResponse> getTodaysBatches() {
        LocalDateTime start = LocalDate.now().atStartOfDay();
        LocalDateTime end   = start.plusDays(1);
        return batchRepository.findTodaysActivity(start, end).stream()
                .map(batch -> toBatchResponse(batch, allocationRepository.findByBatchId(batch.getId())))
                .toList();
    }

    @Transactional(readOnly = true)
    public List<PaymentBatchResponse> getBatchesByCollector(UUID collectorId) {
        return batchRepository.findByCollectedByOrderByCreatedAtDesc(collectorId)
                .stream()
                .map(batch -> toBatchResponse(batch, allocationRepository.findByBatchId(batch.getId())))
                .toList();
    }

    @Transactional(readOnly = true)
    public List<PaymentBatchResponse> getMyPendingBatches(UUID collectorId) {
        return batchRepository.findByCollectedByAndStatusOrderByCollectedAtDesc(collectorId, BatchStatus.AWAITING_REMITTANCE)
                .stream()
                .map(batch -> toBatchResponse(batch, allocationRepository.findByBatchId(batch.getId())))
                .toList();
    }

    @Transactional(readOnly = true)
    public List<PaymentBatchResponse> getPendingRemittances() {
        return batchRepository.findByStatusOrderByCreatedAtAsc(BatchStatus.AWAITING_REMITTANCE).stream()
                .map(batch -> {
                    List<PaymentAllocation> allocs = allocationRepository.findByBatchId(batch.getId());
                    return toBatchResponse(batch, allocs);
                })
                .toList();
    }

    @Transactional(readOnly = true)
    public BigDecimal getMemberTotalBalance(UUID memberId) {
        List<PaymentRecordStatus> pending = List.of(PaymentRecordStatus.OUTSTANDING, PaymentRecordStatus.PARTIALLY_PAID);
        return paymentRecordRepository.findTotalOutstandingByMemberId(memberId, pending);
    }

    @Transactional(readOnly = true)
    public Map<UUID, BigDecimal> getMemberTotalBalanceBulk(List<UUID> memberIds) {
        List<PaymentRecordStatus> pending = List.of(PaymentRecordStatus.OUTSTANDING, PaymentRecordStatus.PARTIALLY_PAID);
        List<Object[]> rows = paymentRecordRepository.findTotalOutstandingByMemberIds(memberIds, pending);
        Map<UUID, BigDecimal> result = new HashMap<>();
        for (Object[] row : rows) {
            result.put((UUID) row[0], (BigDecimal) row[1]);
        }
        return result;
    }

    /**
     * Computes a "fat event" with the member's full payment summary at this point in time.
     * reporting-service uses these totals directly — no cross-service call needed.
     */
    private PaymentCompletedEvent buildCompletedEvent(PaymentBatch batch, UUID actorId) {
        List<PaymentRecord> all = paymentRecordRepository
                .findByMemberIdAndChitIdOrderByMonthNumberAsc(batch.getMemberId(), batch.getChitId());

        BigDecimal totalDue  = all.stream().map(PaymentRecord::getAmountDue).reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal totalPaid = all.stream().map(PaymentRecord::getAmountPaid).reduce(BigDecimal.ZERO, BigDecimal::add);

        long settled  = all.stream().filter(r -> r.getStatus() == PaymentRecordStatus.SETTLED).count();
        long partial  = all.stream().filter(r -> r.getStatus() == PaymentRecordStatus.PARTIALLY_PAID).count();
        long outstanding = all.stream().filter(r -> r.getStatus() == PaymentRecordStatus.OUTSTANDING).count();
        long waived   = all.stream().filter(r -> r.getStatus() == PaymentRecordStatus.WAIVED).count();

        return new PaymentCompletedEvent(
                batch.getId().toString(),
                batch.getChitId().toString(),
                batch.getMemberId().toString(),
                batch.getTotalAmount(),
                batch.getPaymentMode().name(),
                totalDue,
                totalPaid,
                totalDue.subtract(totalPaid),
                (int) settled, (int) partial, (int) outstanding, (int) waived,
                LocalDate.now(),
                actorId.toString(),
                Instant.now()
        );
    }

    private PaymentBatchResponse toBatchResponse(PaymentBatch batch, List<PaymentAllocation> allocations) {
        return PaymentBatchResponse.builder()
                .id(batch.getId())
                .chitId(batch.getChitId())
                .memberId(batch.getMemberId())
                .totalAmount(batch.getTotalAmount())
                .paymentMode(batch.getPaymentMode())
                .status(batch.getStatus())
                .collectedBy(batch.getCollectedBy())
                .recordedBy(batch.getRecordedBy())
                .collectedAt(batch.getCollectedAt())
                .remittedAt(batch.getRemittedAt())
                .remittedBy(batch.getRemittedBy())
                .voidedAt(batch.getVoidedAt())
                .voidedBy(batch.getVoidedBy())
                .voidReason(batch.getVoidReason())
                .notes(batch.getNotes())
                .createdAt(batch.getCreatedAt())
                .allocations(allocations.stream()
                        .map(a -> PaymentBatchResponse.AllocationDetail.builder()
                                .monthNumber(a.getMonthNumber())
                                .allocatedAmount(a.getAllocatedAmount())
                                .paymentRecordId(a.getPaymentRecordId())
                                .chitId(a.getChitId())
                                .build())
                        .toList())
                .build();
    }
}
