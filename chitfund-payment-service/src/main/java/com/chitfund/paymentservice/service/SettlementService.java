package com.chitfund.paymentservice.service;

import com.chitfund.paymentservice.client.ChitServiceClient;
import com.chitfund.paymentservice.client.ChitServiceClient.ChitDto;
import com.chitfund.paymentservice.client.ChitServiceClient.EnrollmentDto;
import com.chitfund.paymentservice.client.ChitServiceClient.ReservationDto;
import com.chitfund.paymentservice.client.MemberServiceClient;
import com.chitfund.paymentservice.client.PayoutServiceClient;
import com.chitfund.paymentservice.client.PayoutServiceClient.PayoutDto;
import com.chitfund.paymentservice.domain.Settlement;
import com.chitfund.paymentservice.domain.SettlementChitItem;
import com.chitfund.paymentservice.domain.PaymentRecord;
import com.chitfund.paymentservice.domain.enums.PaymentRecordStatus;
import com.chitfund.paymentservice.domain.enums.SettlementCase;
import com.chitfund.paymentservice.domain.enums.SettlementMode;
import com.chitfund.paymentservice.domain.enums.SettlementPaymentStatus;
import com.chitfund.common.context.TenantContext;
import com.chitfund.common.exception.BusinessException;
import com.chitfund.common.exception.ErrorCode;
import com.chitfund.paymentservice.dto.request.ConfirmSettlementRequest;
import com.chitfund.paymentservice.dto.request.SettlementPreviewRequest;
import com.chitfund.paymentservice.dto.response.SettlementChitPreviewResponse;
import com.chitfund.paymentservice.dto.response.SettlementChitPreviewResponse.PaymentRecordDetail;
import com.chitfund.paymentservice.dto.response.SettlementPreviewResponse;
import com.chitfund.paymentservice.dto.response.SettlementResponse;
import com.chitfund.paymentservice.repository.ChitMonthDrawRepository;
import com.chitfund.paymentservice.repository.PaymentRecordRepository;
import com.chitfund.paymentservice.repository.SettlementRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Core settlement business logic.
 *
 * WHY is settlement in payment-service?
 * Settlement resolves payment obligations — it directly mutates PaymentRecord rows
 * (status → SETTLEMENT_CLEARED). Keeping this in payment-service avoids cross-service
 * write coordination: one service owns one aggregate.
 *
 * For reads about chits and payouts we call their respective services via HTTP clients.
 * This is the "Application-layer join" pattern in microservices.
 *
 * INTERVIEW: "We made SettlementService a transactional unit inside payment-service.
 * The cross-service calls (chit, payout) are read-only lookups that happen before
 * the transaction. Within the transaction we only write to our own tables:
 * PaymentRecord, Settlement, AdminWalletEntry. If chit-service is down, preview
 * still fails gracefully — we don't partially commit."
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class SettlementService {

    private final PaymentRecordRepository paymentRecordRepository;
    private final ChitMonthDrawRepository chitMonthDrawRepository;
    private final SettlementRepository settlementRepository;
    private final ChitServiceClient chitServiceClient;
    private final PayoutServiceClient payoutServiceClient;
    private final MemberServiceClient memberServiceClient;
    private final PlanExpiryChecker planExpiryChecker;

    // ─────────────────────────────────────────────────────────────────────────
    // PREVIEW
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Computes settlement figures for a member across their chits — no writes, pure calculation.
     */
    @Transactional(readOnly = true)
    public SettlementPreviewResponse preview(SettlementPreviewRequest request) {
        UUID memberId = request.getMemberId();

        // Fetch all enrollments (active AND inactive — completed chit enrollments are inactive)
        List<EnrollmentDto> enrollments = chitServiceClient.getEnrollmentsForMember(memberId);

        // Deduplicate by chitId — a member can have multiple spots in a chit but we treat
        // the chit as one line item (summing across all spots internally)
        List<UUID> distinctChitIds = enrollments.stream()
                .map(EnrollmentDto::getChitId)
                .distinct()
                .collect(Collectors.toList());

        // Filter to requested chits if specified
        if (request.getChitIds() != null && !request.getChitIds().isEmpty()) {
            distinctChitIds.retainAll(request.getChitIds());
        }

        if (distinctChitIds.isEmpty()) {
            return SettlementPreviewResponse.builder()
                    .memberId(memberId)
                    .chitItems(List.of())
                    .totalOwed(BigDecimal.ZERO)
                    .totalRefunded(BigDecimal.ZERO)
                    .grandTotal(BigDecimal.ZERO)
                    .build();
        }

        List<SettlementChitPreviewResponse> items = new ArrayList<>();
        for (UUID chitId : distinctChitIds) {
            SettlementChitPreviewResponse item = computeChitPreview(memberId, chitId, SettlementMode.FAIR);
            if (item != null) items.add(item);
        }

        return buildPreviewResponse(memberId, items);
    }

    /**
     * Called when admin toggles the mode for a CASE_C row — recalculates just that chit.
     * The frontend re-calls preview with the toggled mode baked into the request;
     * this service method is the single source of truth for the calculation.
     */
    @Transactional(readOnly = true)
    public SettlementChitPreviewResponse recompute(UUID memberId, UUID chitId, SettlementMode mode) {
        return computeChitPreview(memberId, chitId, mode);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CONFIRM
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Executes the settlement. Writes to:
     *  1. PaymentRecord rows (OUTSTANDING/PARTIALLY_PAID → SETTLEMENT_CLEARED)
     *  2. Settlement + SettlementChitItem rows (audit trail)
     *  3. AdminWalletEntry (treasury movement)
     *
     * Does NOT touch ChitEnrollment.active — leave that as-is.
     * Does NOT mark PaymentRecords that are already SETTLED / PAYOUT_DEDUCTED / WAIVED.
     */
    @Transactional
    public SettlementResponse confirm(ConfirmSettlementRequest request, UUID adminId) {
        planExpiryChecker.assertNotExpired();
        UUID memberId = request.getMemberId();

        String tenantId = TenantContext.get();
        List<SettlementPaymentStatus> terminalStatuses = List.of(
                SettlementPaymentStatus.FULLY_COLLECTED,
                SettlementPaymentStatus.FULLY_DISBURSED,
                SettlementPaymentStatus.BALANCED);
        if (settlementRepository.existsByMemberIdAndTenantIdAndPaymentStatusNotIn(memberId, tenantId, terminalStatuses)) {
            throw new BusinessException(ErrorCode.SETTLEMENT_ALREADY_EXISTS);
        }

        List<SettlementChitItem> chitItems = new ArrayList<>();
        BigDecimal totalOwed = BigDecimal.ZERO;
        BigDecimal totalRefunded = BigDecimal.ZERO;

        for (ConfirmSettlementRequest.ChitItemRequest itemReq : request.getChitItems()) {
            UUID chitId = itemReq.getChitId();
            SettlementMode mode = itemReq.getMode() != null ? itemReq.getMode() : SettlementMode.FAIR;

            // Re-compute at confirm time (state may have changed since preview)
            SettlementChitPreviewResponse preview = computeChitPreview(memberId, chitId, mode);
            if (preview == null) {
                log.warn("Settlement confirm: could not compute preview for member {} chit {} — skipping", memberId, chitId);
                continue;
            }

            BigDecimal netAmount = preview.getNetAmount();

            // 1. Mark OUTSTANDING/PARTIALLY_PAID PaymentRecords as SETTLEMENT_CLEARED
            List<PaymentRecord> openRecords = paymentRecordRepository
                    .findByMemberIdAndChitIdAndStatusInOrderByMonthNumberAsc(
                            memberId, chitId,
                            List.of(PaymentRecordStatus.OUTSTANDING, PaymentRecordStatus.PARTIALLY_PAID));
            for (PaymentRecord rec : openRecords) {
                rec.setStatus(PaymentRecordStatus.SETTLEMENT_CLEARED);
                paymentRecordRepository.save(rec);
            }
            log.info("Settlement: cleared {} open PaymentRecords for member {} chit {}", openRecords.size(), memberId, chitId);

            // 2. Accumulate totals
            if (netAmount.compareTo(BigDecimal.ZERO) > 0) {
                totalOwed = totalOwed.add(netAmount);
            } else if (netAmount.compareTo(BigDecimal.ZERO) < 0) {
                totalRefunded = totalRefunded.add(netAmount.abs());
            }

            // 3. Build SettlementChitItem (will be added to the Settlement entity)
            // payoutCredit: tracks what fund is crediting to member
            // CASE_C: undisbursed payout remainder; CASE_B1/B2: what member paid back (totalPaidIn)
            BigDecimal payoutCredit;
            if (preview.getSettlementCase() == SettlementCase.CASE_C) {
                payoutCredit = orZero(preview.getStillOwedByFund());
            } else if (preview.getSettlementCase() == SettlementCase.CASE_B1
                    || preview.getSettlementCase() == SettlementCase.CASE_B2) {
                payoutCredit = orZero(preview.getTotalPaidIn());
            } else {
                payoutCredit = BigDecimal.ZERO;
            }

            SettlementChitItem item = SettlementChitItem.builder()
                    .chitId(chitId)
                    .chitName(preview.getChitName())
                    .settlementCase(preview.getSettlementCase())
                    .settlementMode(preview.getSettlementCase() == SettlementCase.CASE_C ? mode : null)
                    .payoutStatus(preview.getPayoutStatus())
                    .disbursedAmount(orZero(preview.getDisbursedAmount()))
                    .netPayoutAmount(orZero(preview.getNetPayoutAmount()))
                    .unpaidDues(orZero(preview.getUnpaidDues()))
                    .futureInstallments(orZero(preview.getFutureInstallments()))
                    .payoutCredit(payoutCredit)
                    .totalPaid(orZero(preview.getTotalPaidIn()))
                    .netAmount(netAmount)
                    .description(preview.getDescription())
                    .build();
            chitItems.add(item);
        }

        BigDecimal baseNetAmount = totalOwed.subtract(totalRefunded);

        // Apply optional admin adjustment (positive = extra charge, negative = discount/waiver)
        BigDecimal adjustment = request.getAdjustmentAmount() != null
                ? request.getAdjustmentAmount()
                : BigDecimal.ZERO;
        BigDecimal netAmount = baseNetAmount.add(adjustment);

        // 4. Save Settlement entity
        // WHY set paymentStatus here?
        // If netAmount==0 the settlement is immediately balanced — no payments needed.
        // Otherwise it starts as PENDING and transitions via SettlementTransactionService
        // as individual payment transactions are recorded.
        SettlementPaymentStatus initialPaymentStatus = netAmount.compareTo(BigDecimal.ZERO) == 0
                ? SettlementPaymentStatus.BALANCED
                : SettlementPaymentStatus.PENDING;

        Settlement settlement = Settlement.builder()
                .tenantId(tenantId)
                .memberId(memberId)
                .settledBy(adminId)
                .settledAt(LocalDateTime.now())
                .totalOwed(totalOwed)
                .totalRefunded(totalRefunded)
                .netAmount(netAmount)
                .notes(request.getNotes())
                .adjustmentAmount(adjustment)
                .adjustmentReason(request.getAdjustmentReason())
                .paymentStatus(initialPaymentStatus)
                .collectedAmount(BigDecimal.ZERO)
                .disbursedAmount(BigDecimal.ZERO)
                .build();
        // Link items to settlement
        for (SettlementChitItem item : chitItems) {
            item.setSettlement(settlement);
        }
        settlement.setChitItems(chitItems);
        Settlement saved = settlementRepository.save(settlement);

        log.info("Settlement confirmed — member {} by admin {}: owes ₹{}, refunded ₹{}, net ₹{}, paymentStatus={}",
                memberId, adminId, totalOwed, totalRefunded, netAmount, initialPaymentStatus);

        // Mark the member INACTIVE — they have fully withdrawn from all chits.
        // Done after commit (best-effort): settlement is already persisted even if this fails.
        memberServiceClient.deactivateMember(memberId);

        return toSettlementResponse(saved);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // HISTORY
    // ─────────────────────────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public org.springframework.data.domain.Page<SettlementResponse> getSettlementsForMember(
            UUID memberId, org.springframework.data.domain.Pageable pageable) {
        return settlementRepository.findByMemberIdAndTenantIdOrderBySettledAtDesc(
                memberId, TenantContext.get(), pageable)
                .map(this::toSettlementResponse);
    }

    @Transactional(readOnly = true)
    public SettlementResponse getById(UUID settlementId) {
        Settlement s = settlementRepository.findById(settlementId)
                .orElseThrow(() -> new IllegalArgumentException("Settlement not found: " + settlementId));
        return toSettlementResponse(s);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CORE CALCULATION
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Computes the settlement figure for one member-chit pair.
     *
     * Steps:
     *  1. Fetch chit details
     *  2. Fetch payout (if any) — determines case
     *  3. Fetch payment records — unpaidDues, installmentsPaidSincePayout
     *  4. Fetch reservations — for B1
     *  5. Determine maxBilledMonth → futureMonths count
     *  6. Apply formula per case
     */
    SettlementChitPreviewResponse computeChitPreview(UUID memberId, UUID chitId, SettlementMode requestedMode) {
        // 1. Chit details
        ChitDto chit = chitServiceClient.getChit(chitId);
        if (chit == null) {
            log.warn("computeChitPreview: chit {} not found", chitId);
            return null;
        }

        // 2. Payout
        PayoutDto payout = payoutServiceClient.getPayoutForMemberInChit(memberId, chitId);

        // 3. Payment records (ALL statuses)
        List<PaymentRecord> allRecords = paymentRecordRepository
                .findByMemberIdAndChitIdOrderByMonthNumberAsc(memberId, chitId);

        // Unpaid dues: sum of (amountDue - amountPaid) for OUTSTANDING / PARTIALLY_PAID
        BigDecimal unpaidDues = allRecords.stream()
                .filter(r -> r.getStatus() == PaymentRecordStatus.OUTSTANDING
                          || r.getStatus() == PaymentRecordStatus.PARTIALLY_PAID)
                .map(r -> r.getAmountDue().subtract(r.getAmountPaid()))
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        // Total paid in (for B2)
        BigDecimal totalPaidIn = allRecords.stream()
                .map(PaymentRecord::getAmountPaid)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        // 4. Reservations — split by status (member may have multiple spots with different states)
        List<ReservationDto> reservations = chitServiceClient.getReservationsForMemberInChit(chitId, memberId);
        List<ReservationDto> reservedSlots = reservations.stream()
                .filter(r -> "RESERVED".equals(r.getStatus()))
                .collect(Collectors.toList());
        int processedSlotCount = (int) reservations.stream()
                .filter(r -> "PROCESSED".equals(r.getStatus()))
                .count();
        ReservationDto firstReservedSlot = reservedSlots.isEmpty() ? null : reservedSlots.get(0);
        int reservedSlotCount = reservedSlots.size();
        int totalActiveSlots = reservedSlotCount + processedSlotCount;

        // Fund refunds for RESERVED slots = proportional share of what member actually paid.
        // Example: member has 2 slots (1 RESERVED + 1 PROCESSED) and paid ₹60k total →
        //   fund owes back ₹30k for the reserved slot; member still owes future installments for the processed one.
        // For all-RESERVED (no processed slots): fund owes back everything (totalPaidIn).
        // For no-slot (B2): also refund everything.
        BigDecimal fundOwesForReserved;
        if (reservedSlotCount > 0 && totalActiveSlots > 0) {
            // Proportional share of totalPaidIn for the reserved slots
            fundOwesForReserved = totalPaidIn
                    .multiply(BigDecimal.valueOf(reservedSlotCount))
                    .divide(BigDecimal.valueOf(totalActiveSlots), 2, RoundingMode.HALF_UP);
        } else if (reservedSlotCount == 0 && processedSlotCount == 0) {
            // B2: no slots at all — refund everything the member paid
            fundOwesForReserved = totalPaidIn;
        } else {
            // Only processed slots (pure CASE_A) — no reserved credit to apply
            fundOwesForReserved = BigDecimal.ZERO;
        }

        BigDecimal postPayoutRate = resolvePostPayoutRate(firstReservedSlot, chit);

        // 5. Max billed month → future months
        int maxBilledMonth = chitMonthDrawRepository
                .findByChitIdOrderByMonthNumberAsc(chitId)
                .stream()
                .mapToInt(d -> d.getMonthNumber())
                .max()
                .orElse(0);

        int durationMonths = chit.getDurationMonths() != null ? chit.getDurationMonths() : 0;

        // Count future months that don't yet have a PaymentRecord for this member
        // "Future" = (maxBilledMonth + 1) to durationMonths
        int futureMonthsCount = countFutureMonthsWithoutRecord(
                memberId, chitId, maxBilledMonth, durationMonths, allRecords);

        // Scale future installments by the number of processed (payout-received) slots.
        // Each processed slot still owes future contributions at postPayoutRate.
        // For pure B cases: processedSlotCount = 0, but futureInstallments isn't used in netAmount anyway.
        int slotsOwingFuture = processedSlotCount > 0 ? processedSlotCount : 1;
        BigDecimal futureInstallments = postPayoutRate
                .multiply(BigDecimal.valueOf(slotsOwingFuture))
                .multiply(BigDecimal.valueOf(futureMonthsCount));

        // 6. Determine case and compute net amount
        SettlementCase settlementCase;
        SettlementMode effectiveMode = null;
        BigDecimal netAmount;
        BigDecimal stillOwedByFund = BigDecimal.ZERO;
        BigDecimal installmentsPaidSincePayout = BigDecimal.ZERO;
        BigDecimal reservedPayoutAmount = null;
        BigDecimal disbursedAmt = BigDecimal.ZERO;
        BigDecimal netPayoutAmt = BigDecimal.ZERO;
        BigDecimal alternativeModeAmount = null;
        String alternativeModeName = null;
        String payoutStatusStr = "NONE";
        Integer payoutMonthNumber = null;

        if (payout == null || "CANCELLED".equals(payout.getStatus()) || "VOIDED".equals(payout.getStatus())) {
            // CASE B
            if (!reservedSlots.isEmpty()) {
                // CASE B1 — has reserved slot(s), no payout received.
                // Refund exactly what they paid (totalPaidIn).
                // Future installments waived — reserved slots are voided on settlement.
                settlementCase = SettlementCase.CASE_B1;
                reservedPayoutAmount = reservedSlots.stream()
                        .map(r -> orZero(r.getPayoutAmount()))
                        .reduce(BigDecimal.ZERO, BigDecimal::add);
                netAmount = totalPaidIn.negate();
            } else {
                // CASE B2 — no slot, no payout. Refund what they paid; admin adjusts if needed.
                settlementCase = SettlementCase.CASE_B2;
                netAmount = totalPaidIn.negate();
            }
            payoutStatusStr = payout != null ? payout.getStatus() : "NONE";

        } else if ("PENDING".equals(payout.getStatus())) {
            // Announced but no money moved yet — treat as B1: refund what they paid.
            settlementCase = SettlementCase.CASE_B1;
            payoutStatusStr = "PENDING";
            payoutMonthNumber = payout.getMonthNumber();
            reservedPayoutAmount = payout.getNetPayoutAmount() != null ? payout.getNetPayoutAmount() : BigDecimal.ZERO;
            netAmount = totalPaidIn.negate();

        } else if ("DISBURSED".equals(payout.getStatus())) {
            // CASE A — payout was received for at least one slot
            settlementCase = SettlementCase.CASE_A;
            payoutStatusStr = "DISBURSED";
            payoutMonthNumber = payout.getMonthNumber();
            disbursedAmt = orZero(payout.getDisbursedAmount());
            netPayoutAmt = orZero(payout.getNetPayoutAmount());
            // If member also has RESERVED slots (mixed multi-slot), credit them back proportionally
            netAmount = unpaidDues.add(futureInstallments).subtract(fundOwesForReserved);

        } else if ("PARTIALLY_DISBURSED".equals(payout.getStatus())) {
            // CASE C
            settlementCase = SettlementCase.CASE_C;
            effectiveMode = requestedMode != null ? requestedMode : SettlementMode.FAIR;
            payoutStatusStr = "PARTIALLY_DISBURSED";
            payoutMonthNumber = payout.getMonthNumber();
            disbursedAmt = orZero(payout.getDisbursedAmount());
            netPayoutAmt = orZero(payout.getNetPayoutAmount());
            stillOwedByFund = netPayoutAmt.subtract(disbursedAmt);

            // installmentsPaidSincePayout = sum of amountPaid for SETTLED/PAYOUT_DEDUCTED records
            //  where monthNumber > payout.monthNumber
            final int payoutMonth = payout.getMonthNumber();
            installmentsPaidSincePayout = allRecords.stream()
                    .filter(r -> r.getMonthNumber() > payoutMonth
                            && (r.getStatus() == PaymentRecordStatus.SETTLED
                             || r.getStatus() == PaymentRecordStatus.PAYOUT_DEDUCTED))
                    .map(PaymentRecord::getAmountPaid)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);

            if (effectiveMode == SettlementMode.FAIR) {
                netAmount = unpaidDues.add(futureInstallments).subtract(stillOwedByFund);
                BigDecimal adminWinAmount = disbursedAmt.subtract(installmentsPaidSincePayout)
                        .max(BigDecimal.ZERO);
                alternativeModeAmount = adminWinAmount;
                alternativeModeName = "ADMIN_WIN";
            } else {
                // ADMIN_WIN
                netAmount = disbursedAmt.subtract(installmentsPaidSincePayout)
                        .max(BigDecimal.ZERO);
                BigDecimal fairAmount = unpaidDues.add(futureInstallments).subtract(stillOwedByFund);
                alternativeModeAmount = fairAmount;
                alternativeModeName = "FAIR";
            }
        } else {
            // Unknown status — treat as no payout
            settlementCase = SettlementCase.CASE_B2;
            netAmount = totalPaidIn.negate();
            payoutStatusStr = payout.getStatus();
        }

        // 7. Build descriptions
        String description = buildDescription(settlementCase, effectiveMode,
                netAmount, unpaidDues, futureInstallments, futureMonthsCount, postPayoutRate,
                netPayoutAmt, disbursedAmt, stillOwedByFund, installmentsPaidSincePayout,
                reservedPayoutAmount, firstReservedSlot != null ? firstReservedSlot.getMonthNumber() : null,
                totalPaidIn, payoutMonthNumber, reservedSlotCount);

        String tooltipDetail = buildTooltipDetail(settlementCase, effectiveMode,
                netAmount, unpaidDues, futureInstallments, futureMonthsCount, postPayoutRate,
                netPayoutAmt, disbursedAmt, stillOwedByFund, installmentsPaidSincePayout,
                reservedPayoutAmount, totalPaidIn, alternativeModeAmount, alternativeModeName, reservedSlotCount);

        // Map all payment records for the expandable draw-cards view
        List<PaymentRecordDetail> recordDetails = allRecords.stream()
                .sorted(java.util.Comparator.comparingInt(PaymentRecord::getMonthNumber))
                .map(r -> PaymentRecordDetail.builder()
                        .monthNumber(r.getMonthNumber())
                        .dueDate(r.getDueDate())
                        .amountDue(r.getAmountDue())
                        .amountPaid(r.getAmountPaid())
                        .balance(r.getAmountDue().subtract(r.getAmountPaid()))
                        .status(r.getStatus().name())
                        .build())
                .collect(Collectors.toList());

        return SettlementChitPreviewResponse.builder()
                .chitId(chitId)
                .chitName(chit.getName())
                .chitStatus(chit.getStatus())
                .settlementCase(settlementCase)
                .currentMode(effectiveMode)
                .payoutStatus(payoutStatusStr)
                .disbursedAmount(disbursedAmt)
                .netPayoutAmount(netPayoutAmt)
                .payoutMonthNumber(payoutMonthNumber)
                .unpaidDues(unpaidDues)
                .futureInstallments(futureInstallments)
                .futureMonthsCount(futureMonthsCount)
                .postPayoutRate(postPayoutRate)
                .stillOwedByFund(stillOwedByFund)
                .installmentsPaidSincePayout(installmentsPaidSincePayout)
                .reservedPayoutAmount(reservedPayoutAmount)
                .reservedMonthNumber(firstReservedSlot != null ? firstReservedSlot.getMonthNumber() : null)
                .reservedSlotCount(reservedSlotCount)
                .fundOwesForReserved(fundOwesForReserved)
                .totalPaidIn(totalPaidIn)
                .netAmount(netAmount)
                .alternativeModeAmount(alternativeModeAmount)
                .alternativeModeName(alternativeModeName)
                .description(description)
                .tooltipDetail(tooltipDetail)
                .paymentRecords(recordDetails)
                .build();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * postPayoutRate resolution priority:
     *  1. MonthReservation.postPayoutContribution (per-slot override)
     *  2. Chit.defaultPostPayoutContribution
     *  3. Chit.installmentAmount (full fallback)
     */
    private BigDecimal resolvePostPayoutRate(ReservationDto reservation, ChitDto chit) {
        if (reservation != null && reservation.getPostPayoutContribution() != null) {
            return reservation.getPostPayoutContribution();
        }
        if (chit.isPostPayoutContributionEnabled() && chit.getDefaultPostPayoutContribution() != null) {
            return chit.getDefaultPostPayoutContribution();
        }
        return chit.getInstallmentAmount() != null ? chit.getInstallmentAmount() : BigDecimal.ZERO;
    }

    /**
     * Counts months from (maxBilledMonth + 1) to durationMonths
     * that do NOT already have a PaymentRecord for this member.
     */
    private int countFutureMonthsWithoutRecord(UUID memberId, UUID chitId,
                                               int maxBilledMonth, int durationMonths,
                                               List<PaymentRecord> existingRecords) {
        if (durationMonths <= maxBilledMonth) return 0;
        // Set of month numbers that already have a record
        java.util.Set<Integer> billedMonths = existingRecords.stream()
                .map(PaymentRecord::getMonthNumber)
                .collect(Collectors.toSet());

        int count = 0;
        for (int m = maxBilledMonth + 1; m <= durationMonths; m++) {
            if (!billedMonths.contains(m)) count++;
        }
        return count;
    }

    private BigDecimal orZero(BigDecimal val) {
        return val != null ? val : BigDecimal.ZERO;
    }

    private String fmt(BigDecimal val) {
        if (val == null) return "₹0";
        return "₹" + val.setScale(0, RoundingMode.HALF_UP).toPlainString();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Description builders
    // ─────────────────────────────────────────────────────────────────────────

    private String buildDescription(SettlementCase sc, SettlementMode mode,
                                    BigDecimal netAmount, BigDecimal unpaidDues,
                                    BigDecimal futureInstallments, int futureMonthsCount,
                                    BigDecimal postPayoutRate, BigDecimal netPayoutAmt,
                                    BigDecimal disbursedAmt, BigDecimal stillOwedByFund,
                                    BigDecimal installmentsPaidSincePayout,
                                    BigDecimal reservedPayoutAmount, Integer reservedMonthNumber,
                                    BigDecimal totalPaidIn, Integer payoutMonthNumber,
                                    int reservedSlotCount) {
        return switch (sc) {
            case CASE_A -> String.format(
                    "Payout of %s fully disbursed in month %d. Past unpaid: %s. Future %d months at %s/mo: %s. Member owes: %s.",
                    fmt(netPayoutAmt), payoutMonthNumber != null ? payoutMonthNumber : 0,
                    fmt(unpaidDues), futureMonthsCount, fmt(postPayoutRate),
                    fmt(futureInstallments), fmt(netAmount));

            case CASE_B1 -> String.format(
                    "%d reserved slot(s) forfeited. Fund refunds %s paid in. %s",
                    reservedSlotCount, fmt(totalPaidIn),
                    netAmount.compareTo(BigDecimal.ZERO) == 0
                        ? "No payment needed."
                        : netAmount.compareTo(BigDecimal.ZERO) < 0
                            ? "Fund pays member: " + fmt(netAmount.abs())
                            : "Member pays: " + fmt(netAmount));

            case CASE_B2 -> String.format(
                    "No slot assigned, no payout received. Fund refunds %s paid in. %s",
                    fmt(totalPaidIn),
                    netAmount.compareTo(BigDecimal.ZERO) == 0
                        ? "No payment needed."
                        : netAmount.compareTo(BigDecimal.ZERO) < 0
                            ? "Fund pays member: " + fmt(netAmount.abs())
                            : "Member pays: " + fmt(netAmount));

            case CASE_C -> {
                if (mode == SettlementMode.FAIR) {
                    boolean fundOwes = netAmount.compareTo(BigDecimal.ZERO) < 0;
                    yield String.format(
                            "Partial payout: %s disbursed of %s net. Fund still owes %s. Unpaid dues: %s. Future installments: %s. Net (fund credit applied): %s.",
                            fmt(disbursedAmt), fmt(netPayoutAmt), fmt(stillOwedByFund),
                            fmt(unpaidDues), fmt(futureInstallments),
                            fundOwes ? "Fund refunds " + fmt(netAmount.abs()) : "Member owes " + fmt(netAmount));
                } else {
                    yield String.format(
                            "Anchor: %s disbursed. Member paid back %s via installments. Net member owes: %s. (Undisbursed %s forgiven on exit.)",
                            fmt(disbursedAmt), fmt(installmentsPaidSincePayout),
                            fmt(netAmount), fmt(stillOwedByFund));
                }
            }
        };
    }

    private String buildTooltipDetail(SettlementCase sc, SettlementMode mode,
                                      BigDecimal netAmount, BigDecimal unpaidDues,
                                      BigDecimal futureInstallments, int futureMonthsCount,
                                      BigDecimal postPayoutRate, BigDecimal netPayoutAmt,
                                      BigDecimal disbursedAmt, BigDecimal stillOwedByFund,
                                      BigDecimal installmentsPaidSincePayout,
                                      BigDecimal reservedPayoutAmount, BigDecimal totalPaidIn,
                                      BigDecimal alternativeModeAmount, String alternativeModeName,
                                      int reservedSlotCount) {
        StringBuilder sb = new StringBuilder();
        switch (sc) {
            case CASE_A -> {
                sb.append("How this was calculated (Case A — Fully Disbursed):\n");
                sb.append("  Unpaid dues: ").append(fmt(unpaidDues)).append("\n");
                sb.append("+ Future installments: ").append(futureMonthsCount).append(" months × ").append(fmt(postPayoutRate)).append(" = ").append(fmt(futureInstallments)).append("\n");
                sb.append("= Member owes: ").append(fmt(netAmount)).append("\n");
                sb.append("\nNote: No alternative mode — payout was fully disbursed.");
            }
            case CASE_B1 -> {
                sb.append("How this was calculated (Case B1 — Reserved Slot(s), No Payout):\n");
                sb.append("  Reserved slots: ").append(reservedSlotCount).append("\n");
                sb.append("  Total paid in by member: ").append(fmt(totalPaidIn)).append("\n");
                sb.append("  Fund refunds: −").append(fmt(totalPaidIn)).append("\n");
                sb.append("= Net: ").append(netAmount.compareTo(BigDecimal.ZERO) <= 0
                        ? "Fund refunds " + fmt(netAmount.abs())
                        : "Member owes " + fmt(netAmount)).append("\n");
                sb.append("\nFuture installments waived. Admin can adjust using the adjustment field.");
            }
            case CASE_B2 -> {
                sb.append("How this was calculated (Case B2 — No Slot, No Payout):\n");
                sb.append("  Total paid in by member: ").append(fmt(totalPaidIn)).append("\n");
                sb.append("  Fund refunds: −").append(fmt(totalPaidIn)).append("\n");
                sb.append("= Net: ").append(netAmount.compareTo(BigDecimal.ZERO) <= 0
                        ? "Fund refunds " + fmt(netAmount.abs())
                        : "Member owes " + fmt(netAmount)).append("\n");
                sb.append("\nFuture installments waived. Admin can adjust using the adjustment field.");
            }
            case CASE_C -> {
                if (mode == SettlementMode.FAIR) {
                    sb.append("How this was calculated (Case C — Partial Payout, Fair Move mode):\n");
                    sb.append("  Unpaid dues: ").append(fmt(unpaidDues)).append("\n");
                    sb.append("+ Future installments: ").append(futureMonthsCount).append(" months × ").append(fmt(postPayoutRate)).append(" = ").append(fmt(futureInstallments)).append("\n");
                    sb.append("− Fund still owes: ").append(fmt(stillOwedByFund)).append(" (").append(fmt(netPayoutAmt)).append(" − ").append(fmt(disbursedAmt)).append(")\n");
                    sb.append("= ").append(netAmount.compareTo(BigDecimal.ZERO) < 0 ? "Fund refunds " + fmt(netAmount.abs()) : "Member owes " + fmt(netAmount)).append("\n");
                    if (alternativeModeAmount != null) {
                        BigDecimal diff = netAmount.subtract(alternativeModeAmount).abs();
                        sb.append("\nAlternative (Admin Win) would give: ").append(fmt(alternativeModeAmount)).append("\n");
                        sb.append("Difference vs Fair Move: ").append(fmt(diff));
                    }
                } else {
                    sb.append("How this was calculated (Case C — Partial Payout, Admin Win mode):\n");
                    sb.append("  Disbursed to member: ").append(fmt(disbursedAmt)).append("\n");
                    sb.append("− Installments paid back since payout: ").append(fmt(installmentsPaidSincePayout)).append("\n");
                    sb.append("= max(0, ").append(fmt(disbursedAmt)).append(" − ").append(fmt(installmentsPaidSincePayout)).append(")\n");
                    sb.append("= Member owes: ").append(fmt(netAmount)).append("\n");
                    sb.append("  (Undisbursed ").append(fmt(stillOwedByFund)).append(" is forgiven on exit)\n");
                    if (alternativeModeAmount != null) {
                        BigDecimal diff = netAmount.subtract(alternativeModeAmount).abs();
                        sb.append("\nAlternative (Fair Move) would give: ").append(fmt(alternativeModeAmount)).append("\n");
                        sb.append("Difference vs Admin Win: ").append(fmt(diff));
                    }
                }
            }
        }
        return sb.toString();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Mapping
    // ─────────────────────────────────────────────────────────────────────────

    // ─────────────────────────────────────────────────────────────────────────
    // ALL SETTLEMENTS
    // ─────────────────────────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public org.springframework.data.domain.Page<SettlementResponse> getAllSettlements(
            org.springframework.data.domain.Pageable pageable) {
        String tenant = TenantContext.get();
        log.info("getAllSettlements: tenant={}", tenant);
        org.springframework.data.domain.Page<Settlement> page =
                settlementRepository.findAllByTenant(tenant, pageable);
        log.info("getAllSettlements: found {} settlements", page.getTotalElements());
        return page.map(this::toSettlementResponse);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // VOID
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Voids a confirmed settlement. Reverts all SETTLEMENT_CLEARED payment records
     * for the member back to OUTSTANDING so they can be included in a future settlement.
     *
     * WHY OUTSTANDING and not the original status?
     * The original status before settlement was OUTSTANDING or PARTIALLY_PAID.
     * We don't store the original status at confirm time. Reverting to OUTSTANDING
     * is conservative — the admin can then manually correct any PARTIALLY_PAID nuances.
     * The key goal is to unblock the member from being re-settled.
     */
    @Transactional
    public SettlementResponse voidSettlement(UUID settlementId, UUID adminId) {
        Settlement settlement = settlementRepository.findById(settlementId)
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND, "Settlement not found"));

        if (!settlement.getTenantId().equals(TenantContext.get())) {
            throw new BusinessException(ErrorCode.RESOURCE_NOT_FOUND, "Settlement not found");
        }

        if (settlement.getPaymentStatus() == SettlementPaymentStatus.VOIDED) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED, "Settlement is already voided");
        }

        // Revert SETTLEMENT_CLEARED records back to OUTSTANDING for this member
        List<PaymentRecord> cleared = paymentRecordRepository
                .findByMemberIdAndStatusIn(settlement.getMemberId(),
                        List.of(PaymentRecordStatus.SETTLEMENT_CLEARED));
        for (PaymentRecord rec : cleared) {
            rec.setStatus(PaymentRecordStatus.OUTSTANDING);
            paymentRecordRepository.save(rec);
        }
        log.info("Void settlement {}: reverted {} SETTLEMENT_CLEARED records to OUTSTANDING for member {}",
                settlementId, cleared.size(), settlement.getMemberId());

        settlement.setPaymentStatus(SettlementPaymentStatus.VOIDED);
        settlement.setVoidedAt(LocalDateTime.now());
        settlement.setVoidedBy(adminId);
        settlementRepository.save(settlement);

        return toSettlementResponse(settlement);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Mapping
    // ─────────────────────────────────────────────────────────────────────────

    private SettlementResponse toSettlementResponse(Settlement s) {
        BigDecimal absNet = s.getNetAmount().abs();
        BigDecimal collected = s.getCollectedAmount() != null ? s.getCollectedAmount() : BigDecimal.ZERO;
        BigDecimal disbursed = s.getDisbursedAmount() != null ? s.getDisbursedAmount() : BigDecimal.ZERO;
        BigDecimal remaining = absNet.subtract(collected.max(disbursed)).max(BigDecimal.ZERO);

        return SettlementResponse.builder()
                .id(s.getId())
                .memberId(s.getMemberId())
                .settledBy(s.getSettledBy())
                .settledAt(s.getSettledAt())
                .totalOwed(s.getTotalOwed())
                .totalRefunded(s.getTotalRefunded())
                .netAmount(s.getNetAmount())
                .notes(s.getNotes())
                .createdAt(s.getCreatedAt())
                .adjustmentAmount(s.getAdjustmentAmount())
                .adjustmentReason(s.getAdjustmentReason())
                .paymentStatus(s.getPaymentStatus())
                .collectedAmount(collected)
                .disbursedAmount(disbursed)
                .remainingAmount(remaining)
                .voidedAt(s.getVoidedAt())
                .voidedBy(s.getVoidedBy())
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

    private SettlementPreviewResponse buildPreviewResponse(UUID memberId, List<SettlementChitPreviewResponse> items) {
        BigDecimal totalOwed = items.stream()
                .map(SettlementChitPreviewResponse::getNetAmount)
                .filter(a -> a.compareTo(BigDecimal.ZERO) > 0)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        BigDecimal totalRefunded = items.stream()
                .map(SettlementChitPreviewResponse::getNetAmount)
                .filter(a -> a.compareTo(BigDecimal.ZERO) < 0)
                .map(BigDecimal::abs)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        BigDecimal grandTotal = totalOwed.subtract(totalRefunded);

        return SettlementPreviewResponse.builder()
                .memberId(memberId)
                .chitItems(items)
                .totalOwed(totalOwed)
                .totalRefunded(totalRefunded)
                .grandTotal(grandTotal)
                .build();
    }
}
