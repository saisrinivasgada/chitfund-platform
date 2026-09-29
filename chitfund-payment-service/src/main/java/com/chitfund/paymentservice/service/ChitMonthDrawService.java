package com.chitfund.paymentservice.service;

import com.chitfund.common.event.ChitMonthOpenedEvent;
import com.chitfund.common.event.ChitMonthSkippedEvent;
import com.chitfund.common.exception.BusinessException;
import com.chitfund.common.exception.ErrorCode;
import com.chitfund.paymentservice.domain.ChitMonthDraw;
import com.chitfund.paymentservice.domain.PaymentRecord;
import com.chitfund.paymentservice.domain.enums.DrawStatus;
import com.chitfund.paymentservice.domain.enums.PaymentRecordStatus;
import com.chitfund.common.exception.ResourceNotFoundException;
import com.chitfund.paymentservice.dto.request.OpenMonthRequest;
import com.chitfund.paymentservice.dto.request.SkipMonthRequest;
import com.chitfund.paymentservice.dto.response.DrawSummaryResponse;
import com.chitfund.paymentservice.dto.response.PaymentRecordResponse;
import com.chitfund.paymentservice.kafka.PaymentEventPublisher;
import com.chitfund.paymentservice.client.ChitServiceClient;
import com.chitfund.paymentservice.repository.ChitMonthDrawRepository;
import com.chitfund.paymentservice.repository.PaymentAllocationRepository;
import com.chitfund.paymentservice.repository.PaymentRecordRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class ChitMonthDrawService {

    private final ChitMonthDrawRepository drawRepository;
    private final PaymentRecordRepository paymentRecordRepository;
    private final PaymentAllocationRepository allocationRepository;
    private final PaymentEventPublisher eventPublisher;
    private final NotificationService notificationService;
    private final com.chitfund.paymentservice.client.MemberServiceClient memberServiceClient;
    private final com.chitfund.paymentservice.client.AuditClient auditClient;
    private final PlanExpiryChecker planExpiryChecker;
    private final MemberCreditService memberCreditService;
    private final ChitServiceClient chitServiceClient;
    private final com.chitfund.paymentservice.client.PayoutServiceClient payoutServiceClient;

    @Transactional
    public DrawSummaryResponse openDraw(OpenMonthRequest request, UUID adminId, String actorRole) {
        planExpiryChecker.assertNotExpired();
        String tenantId = requireTenantContext();
        ValidatedDrawInput validated = validateChitAndMembers(
                request.getChitId(), request.getMembers().stream()
                        .map(OpenMonthRequest.MemberAmount::getMemberId).toList());
        ChitServiceClient.ChitDto chit = validated.chit();
        validateOpenDrawContract(request, chit, validated.amounts());
        long realCycles = drawRepository.countByTenantIdAndChitIdAndStatusNot(
                tenantId, request.getChitId(), DrawStatus.SKIPPED);
        if (realCycles >= chit.getDurationMonths()) {
            throw new BusinessException(ErrorCode.CHIT_CYCLES_EXHAUSTED,
                    "All " + chit.getDurationMonths() + " real cycles for this chit have already been opened. Skipped draws do not count toward the total.");
        }

        if (drawRepository.existsByTenantIdAndChitIdAndMonthNumber(
                tenantId, request.getChitId(), request.getMonthNumber())) {
            throw new BusinessException(ErrorCode.MONTH_ALREADY_OPEN,
                    "Draw " + request.getMonthNumber() + " is already open or skipped for this chit");
        }

        boolean isAuctionDraw = request.getAuctionMode() != null;
        DrawStatus initialStatus = isAuctionDraw ? DrawStatus.AWAITING_AUCTION : DrawStatus.OPEN;

        ChitMonthDraw cycle = ChitMonthDraw.builder()
                .tenantId(tenantId)
                .chitId(request.getChitId())
                .monthNumber(request.getMonthNumber())
                .dueDate(request.getDueDate())
                .installmentAmount(request.getInstallmentAmount())
                .capacity(request.getMembers().size())
                .auctionMode(request.getAuctionMode())
                .status(initialStatus)
                .openedAt(LocalDateTime.now())
                .openedBy(adminId)
                .build();
        drawRepository.save(cycle);

        // Auction draws: payment records created after auction closes (via applyAuctionDividend)
        List<PaymentRecord> records;
        if (isAuctionDraw) {
            records = List.of();
        } else {
            records = new java.util.ArrayList<>();
            for (var m : request.getMembers()) {
                BigDecimal amountDue = m.getAmountDue();
                BigDecimal creditBalance = memberCreditService.getBalance(m.getMemberId());
                BigDecimal creditToApply = creditBalance.min(amountDue);

                PaymentRecordStatus status;
                BigDecimal amountPaid;
                if (creditToApply.compareTo(BigDecimal.ZERO) <= 0) {
                    status = PaymentRecordStatus.OUTSTANDING;
                    amountPaid = BigDecimal.ZERO;
                } else if (creditToApply.compareTo(amountDue) >= 0) {
                    status = PaymentRecordStatus.CREDIT_COVERED;
                    amountPaid = amountDue;
                    memberCreditService.consumeCredit(m.getMemberId(), amountDue, null, request.getChitId(), adminId,
                            "Auto-applied — draw #" + request.getMonthNumber() + " opened for chit " + request.getChitId());
                } else {
                    status = PaymentRecordStatus.PARTIAL_CREDIT;
                    amountPaid = creditToApply;
                    memberCreditService.consumeCredit(m.getMemberId(), creditToApply, null, request.getChitId(), adminId,
                            "Partial auto-applied — draw #" + request.getMonthNumber() + " opened for chit " + request.getChitId());
                }

                records.add(PaymentRecord.builder()
                        .tenantId(tenantId)
                        .chitId(request.getChitId())
                        .memberId(m.getMemberId())
                        .monthNumber(request.getMonthNumber())
                        .dueDate(request.getDueDate())
                        .amountDue(amountDue)
                        .amountPaid(amountPaid)
                        .status(status)
                        .build());
            }
        }
        if (!records.isEmpty()) {
            paymentRecordRepository.saveAll(records);
        }

        log.info("Actor {} ({}) opened cycle {} for chit {} — {} payment records created (auctionMode={})",
                adminId, actorRole, request.getMonthNumber(), request.getChitId(), records.size(), request.getAuctionMode());

        auditClient.log("CHIT_DRAW",
                request.getChitId() + "-" + request.getMonthNumber(),
                request.getChitId().toString(),
                "DRAW_OPENED", adminId.toString(), actorRole,
                null,
                Map.of("monthNumber", request.getMonthNumber(),
                        "dueDate", String.valueOf(request.getDueDate()),
                        "members", records.size()),
                com.chitfund.common.context.TenantContext.get());

        List<String> memberIdStrings = request.getMembers().stream()
                .map(m -> m.getMemberId().toString()).toList();
        ChitMonthOpenedEvent openedEvent = new ChitMonthOpenedEvent(
                com.chitfund.common.context.TenantContext.get(),
                request.getChitId().toString(),
                null,
                request.getMonthNumber(),
                request.getDueDate(),
                request.getInstallmentAmount(),
                request.getMembers().size(),
                memberIdStrings,
                adminId.toString(),
                actorRole,
                Instant.now()
        );
        eventPublisher.publish(openedEvent);

        // Notify enrolled members: their payment is due
        try {
            List<java.util.UUID> memberIds = request.getMembers().stream()
                    .map(m -> m.getMemberId()).toList();
            java.util.Map<String, String> userIdMap = memberServiceClient.batchGetUserIds(memberIds);
            List<java.util.UUID> userIds = userIdMap.values().stream()
                    .map(java.util.UUID::fromString).toList();
            if (!userIds.isEmpty()) {
                notificationService.notifyUsers(userIds,
                        com.chitfund.paymentservice.domain.enums.NotificationType.CYCLE_OPENED,
                        "Payment Due — Cycle #" + request.getMonthNumber(),
                        "Your installment of ₹" + request.getInstallmentAmount() +
                                " is due by " + request.getDueDate() + ".",
                        "CYCLE", cycle.getId(), "/member");
            }
        } catch (Exception ex) {
            log.warn("Could not send cycle notifications: {}", ex.getMessage());
        }

        return buildSummary(cycle, records);
    }

    /**
     * Called by chit-service after an auction closes.
     * Transitions the draw from AWAITING_AUCTION → OPEN and creates payment records
     * for every member with gross installment, dividend deduction, and net amount due.
     */
    @Transactional
    public void applyAuctionDividend(UUID chitId, Integer monthNumber,
                                     BigDecimal grossInstallmentAmount,
                                     BigDecimal dividendPerSpot,
                                     List<MemberSpotEntry> memberSpots,
                                     String tenantId) {
        applyAuctionDividend(chitId, monthNumber, grossInstallmentAmount,
                dividendPerSpot, memberSpots, tenantId, null);
    }

    /**
     * @param distributableDiscount total discount available to members after
     *        commission. Optional — when null, no rounding remainder is spread
     *        and behaviour matches the pre-2026-09-10 contract.
     */
    @Transactional
    public void applyAuctionDividend(UUID chitId, Integer monthNumber,
                                     BigDecimal grossInstallmentAmount,
                                     BigDecimal dividendPerSpot,
                                     List<MemberSpotEntry> memberSpots,
                                     String tenantId,
                                     BigDecimal distributableDiscount) {
        requireTenant(tenantId);
        ChitMonthDraw draw = drawRepository.findAuctionDrawForUpdate(tenantId, chitId, monthNumber)
                .orElseThrow(() -> new com.chitfund.common.exception.ResourceNotFoundException("Draw",
                        chitId + "/" + monthNumber));

        List<PaymentRecord> expectedRecords = buildAuctionRecords(
                draw, chitId, monthNumber, grossInstallmentAmount, dividendPerSpot,
                memberSpots, tenantId, distributableDiscount);

        if (draw.getStatus() == DrawStatus.OPEN && draw.getAuctionMode() != null) {
            List<PaymentRecord> existing = paymentRecordRepository
                    .findByTenantIdAndChitIdAndMonthNumber(tenantId, chitId, monthNumber);
            if (sameAuctionAssessment(existing, expectedRecords)) {
                log.info("Auction dividend command already applied for chit {} month {}; returning idempotently",
                        chitId, monthNumber);
                return;
            }
            throw new BusinessException(ErrorCode.CONCURRENT_MODIFICATION,
                    "Auction dividend was already applied with different financial values");
        }

        if (draw.getStatus() != DrawStatus.AWAITING_AUCTION || draw.getAuctionMode() == null) {
            throw new BusinessException(ErrorCode.INVALID_STATUS_TRANSITION,
                    "Draw is not in AWAITING_AUCTION state. Current: " + draw.getStatus());
        }

        paymentRecordRepository.saveAll(expectedRecords);

        draw.setStatus(DrawStatus.OPEN);
        drawRepository.save(draw);

        log.info("Auction dividend applied: drawId={} chit={} month={} members={} grossInstallment={} dividendPerSpot={}",
                draw.getId(), chitId, monthNumber, expectedRecords.size(), grossInstallmentAmount, dividendPerSpot);

        if (log.isDebugEnabled()) {
            expectedRecords.forEach(r -> log.debug(
                    "  payment record: memberId={} spots={} gross={} dividend={} netDue={}",
                    r.getMemberId(),
                    r.getGrossInstallmentAmount() == null ? 1
                            : r.getGrossInstallmentAmount().divide(grossInstallmentAmount, 0, java.math.RoundingMode.DOWN).intValue(),
                    r.getGrossInstallmentAmount(), r.getDividendDeductedAmount(), r.getAmountDue()));
        }
    }

    private List<PaymentRecord> buildAuctionRecords(
            ChitMonthDraw draw, UUID chitId, Integer monthNumber,
            BigDecimal grossInstallmentAmount, BigDecimal dividendPerSpot,
            List<MemberSpotEntry> memberSpots, String tenantId,
            BigDecimal distributableDiscount) {

        // dividendPerSpot is rounded down, so spots x perSpot can fall a few paise
        // short of what was actually distributable. Those paise belong to the
        // members, not to the fund, so hand them out one at a time — largest
        // remainder, ordered by member id so the same auction always produces the
        // same allocation.
        //
        // distributableDiscount is optional: when it is absent (an older caller)
        // there is no remainder to spread and behaviour is unchanged.
        long spareePaise = remainderPaise(dividendPerSpot, memberSpots, distributableDiscount);

        List<MemberSpotEntry> ordered = memberSpots.stream()
                .sorted(java.util.Comparator.comparing(ms -> ms.memberId().toString()))
                .toList();

        List<PaymentRecord> records = new java.util.ArrayList<>();
        for (MemberSpotEntry ms : ordered) {
            BigDecimal dividend = dividendPerSpot.multiply(BigDecimal.valueOf(ms.spots()));
            if (spareePaise > 0) {
                dividend = dividend.add(new BigDecimal("0.01"));
                spareePaise--;
            }
            BigDecimal gross = grossInstallmentAmount.multiply(BigDecimal.valueOf(ms.spots()));
            BigDecimal netDue = gross.subtract(dividend).max(BigDecimal.ZERO);
            records.add(PaymentRecord.builder()
                    .tenantId(tenantId)
                    .chitId(chitId)
                    .memberId(ms.memberId())
                    .monthNumber(monthNumber)
                    .dueDate(draw.getDueDate())
                    .grossInstallmentAmount(gross)
                    .dividendDeductedAmount(dividend)
                    .amountDue(netDue)
                    .amountPaid(BigDecimal.ZERO)
                    .status(PaymentRecordStatus.OUTSTANDING)
                    .build());
        }

        return records;
    }

    private boolean sameAuctionAssessment(List<PaymentRecord> existing, List<PaymentRecord> expected) {
        if (existing.size() != expected.size()) return false;
        Map<UUID, PaymentRecord> byMember = existing.stream()
                .collect(Collectors.toMap(PaymentRecord::getMemberId, record -> record, (a, b) -> a));
        return expected.stream().allMatch(wanted -> {
            PaymentRecord actual = byMember.get(wanted.getMemberId());
            return actual != null
                    && sameMoney(actual.getGrossInstallmentAmount(), wanted.getGrossInstallmentAmount())
                    && sameMoney(actual.getDividendDeductedAmount(), wanted.getDividendDeductedAmount())
                    && sameMoney(actual.getAmountDue(), wanted.getAmountDue())
                    && Objects.equals(actual.getDueDate(), wanted.getDueDate());
        });
    }

    private boolean sameMoney(BigDecimal left, BigDecimal right) {
        return left != null && right != null && left.compareTo(right) == 0;
    }

    private void requireTenant(String tenantId) {
        if (tenantId == null || tenantId.isBlank()) {
            throw new BusinessException(ErrorCode.FORBIDDEN, "Organization context is required");
        }
    }

    public record MemberSpotEntry(UUID memberId, int spots) {}

    /**
     * How many paise the rounded-down per-spot dividend failed to distribute.
     *
     * <p>Returns 0 when the caller did not supply the distributable total, so an
     * older chit-service keeps today's behaviour rather than silently changing
     * what members owe. Also returns 0 if the figure looks wrong (negative, or
     * larger than one paisa per spot), because a bad input should leave dues
     * alone rather than inflate a discount.
     */
    private long remainderPaise(BigDecimal dividendPerSpot,
                                List<MemberSpotEntry> memberSpots,
                                BigDecimal distributableDiscount) {
        if (distributableDiscount == null || dividendPerSpot == null) return 0;
        long totalSpots = memberSpots.stream().mapToLong(MemberSpotEntry::spots).sum();
        if (totalSpots <= 0) return 0;

        BigDecimal allocated = dividendPerSpot.multiply(BigDecimal.valueOf(totalSpots));
        BigDecimal shortfall = distributableDiscount.subtract(allocated);
        if (shortfall.signum() <= 0) return 0;

        long paise = shortfall.movePointRight(2).setScale(0, java.math.RoundingMode.HALF_UP).longValueExact();
        // At most one spare paisa per member; anything more means the inputs
        // disagree and we should not be inventing a discount.
        return Math.min(paise, memberSpots.size());
    }

    /**
     * Reverses the effects of applyAuctionDividend — resets draw back to AWAITING_AUCTION
     * and deletes the payment records created when the auction closed.
     * Fails if any member has already paid (admin must void those batches first).
     */
    @Transactional
    public void reverseAuctionDividend(UUID chitId, Integer monthNumber, String tenantId) {
        requireTenant(tenantId);
        ChitMonthDraw draw = drawRepository.findAuctionDrawForUpdate(tenantId, chitId, monthNumber)
                .orElseThrow(() -> new com.chitfund.common.exception.ResourceNotFoundException("Draw",
                        chitId + "/" + monthNumber));

        if (draw.getStatus() == DrawStatus.AWAITING_AUCTION) {
            List<PaymentRecord> remaining = paymentRecordRepository
                    .findByTenantIdAndChitIdAndMonthNumber(tenantId, chitId, monthNumber);
            if (remaining.isEmpty()) {
                log.info("Auction dividend command already reversed for chit {} month {}; returning idempotently",
                        chitId, monthNumber);
                return;
            }
            throw new BusinessException(ErrorCode.CONCURRENT_MODIFICATION,
                    "Auction draw is awaiting auction but payment records still exist");
        }

        if (draw.getStatus() != DrawStatus.OPEN || draw.getAuctionMode() == null) {
            throw new BusinessException(ErrorCode.INVALID_STATUS_TRANSITION,
                    "Draw is not in OPEN state. Cannot reverse auction dividend. Current: " + draw.getStatus());
        }

        List<com.chitfund.paymentservice.domain.PaymentRecord> records =
                paymentRecordRepository.findByTenantIdAndChitIdAndMonthNumber(tenantId, chitId, monthNumber);

        boolean hasPayments = records.stream()
                .anyMatch(r -> r.getAmountPaid() != null
                        && r.getAmountPaid().compareTo(java.math.BigDecimal.ZERO) > 0);
        if (hasPayments) {
            long count = records.stream()
                    .filter(r -> r.getAmountPaid() != null
                            && r.getAmountPaid().compareTo(java.math.BigDecimal.ZERO) > 0)
                    .count();
            throw new BusinessException(ErrorCode.CYCLE_HAS_PAYMENTS,
                    count + " member(s) have already paid. Void their payment batches first, then re-auction.");
        }

        paymentRecordRepository.deleteByTenantIdAndChitIdAndMonthNumber(tenantId, chitId, monthNumber);
        draw.setStatus(DrawStatus.AWAITING_AUCTION);
        drawRepository.save(draw);

        log.info("Auction dividend reversed: drawId={} chit={} month={} records deleted={}",
                draw.getId(), chitId, monthNumber, records.size());
    }

    @Transactional
    public DrawSummaryResponse skipDraw(SkipMonthRequest request, UUID adminId, String actorRole) {
        planExpiryChecker.assertNotExpired();
        String tenantId = requireTenantContext();
        ValidatedDrawInput validated = validateChitAndMembers(request.getChitId(), request.getMemberIds());
        if (request.getInstallmentAmount().compareTo(validated.chit().getInstallmentAmount()) != 0) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    "Installment amount does not match the chit configuration");
        }
        if (drawRepository.existsByTenantIdAndChitIdAndMonthNumber(
                tenantId, request.getChitId(), request.getMonthNumber())) {
            throw new BusinessException(ErrorCode.MONTH_ALREADY_OPEN,
                    "Draw " + request.getMonthNumber() + " is already open or skipped for this chit");
        }

        ChitMonthDraw cycle = ChitMonthDraw.builder()
                .tenantId(tenantId)
                .chitId(request.getChitId())
                .monthNumber(request.getMonthNumber())
                .dueDate(request.getDueDate())
                .installmentAmount(request.getInstallmentAmount())
                .capacity(request.getMemberIds().size())
                .status(DrawStatus.SKIPPED)
                .skipReason(request.getSkipReason())
                .skippedAt(LocalDateTime.now())
                .skippedBy(adminId)
                .build();
        drawRepository.save(cycle);

        // WAIVED records preserve installmentAmount for reports ("₹X waived in month Y due to Z")
        List<PaymentRecord> waivedRecords = request.getMemberIds().stream()
                .map(memberId -> PaymentRecord.builder()
                        .tenantId(com.chitfund.common.context.TenantContext.get())
                        .chitId(request.getChitId())
                        .memberId(memberId)
                        .monthNumber(request.getMonthNumber())
                        .dueDate(request.getDueDate())
                        .amountDue(request.getInstallmentAmount())
                        .amountPaid(BigDecimal.ZERO)
                        .status(PaymentRecordStatus.WAIVED)
                        .build())
                .toList();
        paymentRecordRepository.saveAll(waivedRecords);

        log.info("Actor {} ({}) skipped month {} for chit {}. Reason: {}",
                adminId, actorRole, request.getMonthNumber(), request.getChitId(), request.getSkipReason());

        auditClient.log("CHIT_DRAW",
                request.getChitId() + "-" + request.getMonthNumber(),
                request.getChitId().toString(),
                "DRAW_SKIPPED", adminId.toString(), actorRole,
                null,
                Map.of("monthNumber", request.getMonthNumber(),
                        "reason", request.getSkipReason() != null ? request.getSkipReason() : ""),
                com.chitfund.common.context.TenantContext.get());

        ChitMonthSkippedEvent skippedEvent = new ChitMonthSkippedEvent(
                com.chitfund.common.context.TenantContext.get(),
                request.getChitId().toString(),
                null,
                request.getMonthNumber(),
                request.getDueDate(),
                request.getInstallmentAmount(),
                request.getMemberIds().size(),
                request.getMemberIds().stream().map(UUID::toString).toList(),
                request.getSkipReason(),
                adminId.toString(),
                actorRole,
                Instant.now()
        );
        eventPublisher.publish(skippedEvent);

        return buildSummary(cycle, waivedRecords);
    }

    @Transactional
    public DrawSummaryResponse closeDraw(UUID cycleId, UUID adminId, String actorRole) {
        ChitMonthDraw cycle = drawRepository.findByIdAndTenantIdForUpdate(
                        cycleId, com.chitfund.common.context.TenantContext.get())
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND,
                        "Cycle not found: " + cycleId));

        if (cycle.getStatus() != DrawStatus.OPEN) {
            throw new BusinessException(ErrorCode.INVALID_STATUS_TRANSITION,
                    "Only OPEN draws can be closed. Current status: " + cycle.getStatus());
        }

        cycle.setStatus(DrawStatus.CLOSED);
        cycle.setClosedAt(LocalDateTime.now());
        cycle.setClosedBy(adminId);
        drawRepository.save(cycle);

        log.info("Actor {} ({}) closed draw {} for chit {}", adminId, actorRole, cycle.getMonthNumber(), cycle.getChitId());

        auditClient.log("CHIT_DRAW",
                cycle.getChitId() + "-" + cycle.getMonthNumber(),
                cycle.getChitId().toString(),
                "DRAW_CLOSED", adminId.toString(), actorRole,
                Map.of("status", "OPEN"),
                Map.of("status", "CLOSED", "monthNumber", cycle.getMonthNumber()),
                com.chitfund.common.context.TenantContext.get());

        return buildSummaryWithLiveStats(cycle);
    }

    /**
     * Auto-closes a draw when every member's payment record is SETTLED or WAIVED.
     * Called after every FIFO application — no admin input needed.
     *
     * WHY auto-close?
     * A draw's purpose is to collect installments. Once every member has paid,
     * the draw is naturally over — admin doesn't need to click anything.
     * Leaving it OPEN would show it as active in the dashboard forever.
     */
    @Transactional
    public void autoCloseIfAllSettled(UUID chitId, int monthNumber) {
        String tenantId = requireTenantContext();
        ChitMonthDraw draw = drawRepository
                .findByTenantIdAndChitIdAndMonthNumber(tenantId, chitId, monthNumber).orElse(null);
        if (draw == null || draw.getStatus() != DrawStatus.OPEN) return;

        List<PaymentRecord> records = paymentRecordRepository
                .findByTenantIdAndChitIdAndMonthNumber(tenantId, chitId, monthNumber);

        boolean allDone = records.stream().allMatch(r ->
                r.getStatus() == PaymentRecordStatus.SETTLED
                || r.getStatus() == PaymentRecordStatus.WAIVED
                || r.getStatus() == PaymentRecordStatus.PAYOUT_DEDUCTED
                || r.getStatus() == PaymentRecordStatus.CREDIT_COVERED
                || r.getStatus() == PaymentRecordStatus.SETTLEMENT_CLEARED);

        if (allDone && !records.isEmpty()) {
            draw.setStatus(DrawStatus.CLOSED);
            draw.setClosedAt(LocalDateTime.now());
            draw.setClosedBy(UUID.fromString("00000000-0000-0000-0000-000000000001")); // system auto-close
            drawRepository.save(draw);
            log.info("Auto-closed draw (chit {} month {}) — all {} members settled",
                    chitId, monthNumber, records.size());
        }
    }

    /**
     * Re-opens a CLOSED draw when a voided payment leaves records unsettled.
     * Counterpart to autoCloseIfAllSettled — called after every void.
     *
     * WHY: If a payment auto-closed a draw and that payment is later voided,
     * the draw must go back to OPEN so the dashboard shows it as active again.
     */
    @Transactional
    public void autoReopenIfNotFullySettled(UUID chitId, int monthNumber) {
        String tenantId = requireTenantContext();
        ChitMonthDraw draw = drawRepository
                .findByTenantIdAndChitIdAndMonthNumber(tenantId, chitId, monthNumber).orElse(null);
        if (draw == null || draw.getStatus() != DrawStatus.CLOSED) return;

        List<PaymentRecord> records = paymentRecordRepository
                .findByTenantIdAndChitIdAndMonthNumber(tenantId, chitId, monthNumber);

        boolean allDone = records.stream().allMatch(r ->
                r.getStatus() == PaymentRecordStatus.SETTLED
                || r.getStatus() == PaymentRecordStatus.WAIVED
                || r.getStatus() == PaymentRecordStatus.PAYOUT_DEDUCTED
                || r.getStatus() == PaymentRecordStatus.CREDIT_COVERED
                || r.getStatus() == PaymentRecordStatus.SETTLEMENT_CLEARED);

        if (!allDone && !records.isEmpty()) {
            draw.setStatus(DrawStatus.OPEN);
            draw.setClosedAt(null);
            draw.setClosedBy(null);
            drawRepository.save(draw);
            log.info("Auto-reopened draw (chit {} month {}) — void left records unsettled",
                    chitId, monthNumber);
        }
    }

    /**
     * Auto-closes all OPEN draws for a chit when the chit is completed.
     * Called internally from chit-service via X-Internal-Key endpoint.
     */
    @Transactional
    public void closeOpenDrawsForChit(UUID chitId, String tenantId) {
        requireTenant(tenantId);
        List<ChitMonthDraw> openDraws = drawRepository
                .findByTenantIdAndChitIdAndStatus(tenantId, chitId, DrawStatus.OPEN);
        if (openDraws.isEmpty()) return;
        LocalDateTime now = LocalDateTime.now();
        // Use a fixed system UUID for system-initiated closes
        UUID systemActor = UUID.fromString("00000000-0000-0000-0000-000000000001");
        for (ChitMonthDraw draw : openDraws) {
            draw.setStatus(DrawStatus.CLOSED);
            draw.setClosedAt(now);
            draw.setClosedBy(systemActor);
        }
        drawRepository.saveAll(openDraws);
        log.info("Auto-closed {} OPEN draws for completed chit {}", openDraws.size(), chitId);
    }

    @Transactional(readOnly = true)
    public List<DrawSummaryResponse> getDashboard() {
        // Include AWAITING_AUCTION draws so auction chit draws appear on the dashboard
        List<ChitMonthDraw> openCycles = drawRepository.findByTenantIdAndStatusInOrderByDueDateAsc(
                com.chitfund.common.context.TenantContext.get(),
                List.of(DrawStatus.OPEN, DrawStatus.AWAITING_AUCTION));
        return openCycles.stream()
                .map(this::buildSummaryWithLiveStats)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<DrawSummaryResponse> getCyclesForChit(UUID chitId) {
        return drawRepository.findByTenantIdAndChitIdOrderByMonthNumberAsc(
                        requireTenantContext(), chitId).stream()
                .map(this::buildSummaryWithLiveStats)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<DrawSummaryResponse> getRecentDraws(int days) {
        LocalDateTime since = LocalDateTime.now().minusDays(days);
        return drawRepository.findRecentDrawsByTenant(
                com.chitfund.common.context.TenantContext.get(), since,
                org.springframework.data.domain.PageRequest.of(0, 200)).stream()
                .map(this::buildSummaryWithLiveStats)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<DrawSummaryResponse> getTodaysDraws() {
        LocalDateTime start = LocalDate.now().atStartOfDay();
        LocalDateTime end   = start.plusDays(1);
        return drawRepository.findTodaysDrawsByTenant(
                com.chitfund.common.context.TenantContext.get(), start, end).stream()
                .map(this::buildSummaryWithLiveStats)
                .toList();
    }

    private DrawSummaryResponse buildSummaryWithLiveStats(ChitMonthDraw cycle) {
        List<PaymentRecord> records = paymentRecordRepository
                .findByTenantIdAndChitIdAndMonthNumber(
                        cycle.getTenantId(), cycle.getChitId(), cycle.getMonthNumber());

        long settled     = count(records, PaymentRecordStatus.SETTLED)
                         + count(records, PaymentRecordStatus.PAYOUT_DEDUCTED);
        long partial     = count(records, PaymentRecordStatus.PARTIALLY_PAID);
        long outstanding = count(records, PaymentRecordStatus.OUTSTANDING);
        long waived      = count(records, PaymentRecordStatus.WAIVED);

        BigDecimal totalCollected = records.stream()
                .map(PaymentRecord::getAmountPaid)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        BigDecimal totalOutstanding = records.stream()
                .filter(r -> r.getStatus() == PaymentRecordStatus.OUTSTANDING
                          || r.getStatus() == PaymentRecordStatus.PARTIALLY_PAID)
                .map(r -> r.getAmountDue().subtract(r.getAmountPaid()))
                .filter(b -> b.compareTo(BigDecimal.ZERO) > 0)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        return DrawSummaryResponse.builder()
                .id(cycle.getId())
                .chitId(cycle.getChitId())
                .monthNumber(cycle.getMonthNumber())
                .dueDate(cycle.getDueDate())
                .installmentAmount(cycle.getInstallmentAmount())
                .capacity(cycle.getCapacity())
                .status(cycle.getStatus())
                .settledCount((int) settled)
                .partiallyPaidCount((int) partial)
                .outstandingCount((int) outstanding)
                .waivedCount((int) waived)
                .totalCollected(totalCollected)
                .totalOutstanding(totalOutstanding)
                .skipReason(cycle.getSkipReason())
                .openedAt(cycle.getOpenedAt())
                .openedBy(cycle.getOpenedBy())
                .closedAt(cycle.getClosedAt())
                .closedBy(cycle.getClosedBy())
                .skippedAt(cycle.getSkippedAt())
                .skippedBy(cycle.getSkippedBy())
                .build();
    }

    private DrawSummaryResponse buildSummary(ChitMonthDraw cycle, List<PaymentRecord> records) {
        boolean isSkipped = cycle.getStatus() == DrawStatus.SKIPPED;
        int memberCount = records.size();

        return DrawSummaryResponse.builder()
                .id(cycle.getId())
                .chitId(cycle.getChitId())
                .monthNumber(cycle.getMonthNumber())
                .dueDate(cycle.getDueDate())
                .installmentAmount(cycle.getInstallmentAmount())
                .capacity(memberCount)
                .status(cycle.getStatus())
                .settledCount(0)
                .partiallyPaidCount(0)
                .outstandingCount(isSkipped ? 0 : memberCount)
                .waivedCount(isSkipped ? memberCount : 0)
                .totalCollected(BigDecimal.ZERO)
                .totalOutstanding(isSkipped ? BigDecimal.ZERO
                        : records.stream().map(PaymentRecord::getAmountDue).reduce(BigDecimal.ZERO, BigDecimal::add))
                .skipReason(cycle.getSkipReason())
                .openedAt(cycle.getOpenedAt())
                .openedBy(cycle.getOpenedBy())
                .closedAt(cycle.getClosedAt())
                .closedBy(cycle.getClosedBy())
                .skippedAt(cycle.getSkippedAt())
                .skippedBy(cycle.getSkippedBy())
                .build();
    }

    /**
     * Discards an accidentally-opened, pristine cycle and its generated unpaid records.
     *
     * Financial, winner, auction, reservation, payout, allocation, credit, and settlement
     * history is never physically erased here. Those states require explicit audited
     * reversal/void operations. Cross-service checks deliberately fail closed.
     */
    @Transactional
    public void deleteDraw(UUID cycleId, UUID adminId, String actorRole) {
        ChitMonthDraw cycle = drawRepository.findByIdAndTenantIdForUpdate(
                        cycleId, com.chitfund.common.context.TenantContext.get())
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND,
                        "Cycle not found: " + cycleId));

        if (cycle.getStatus() != DrawStatus.OPEN) {
            throw new BusinessException(ErrorCode.CYCLE_NOT_DELETABLE,
                    "Only OPEN cycles can be deleted. This cycle is " + cycle.getStatus());
        }

        List<PaymentRecord> records = paymentRecordRepository
                .findByTenantIdAndChitIdAndMonthNumber(
                        cycle.getTenantId(), cycle.getChitId(), cycle.getMonthNumber());

        boolean hasFinancialState = records.stream().anyMatch(r ->
                r.getStatus() != PaymentRecordStatus.OUTSTANDING
                        || r.getAmountPaid() == null
                        || r.getAmountPaid().compareTo(BigDecimal.ZERO) != 0
                        || r.getSettledByPayoutId() != null);
        if (hasFinancialState) {
            throw new BusinessException(ErrorCode.CYCLE_HAS_PAYMENTS,
                    "This draw has payment, credit, payout-deduction, waiver, or settlement history and cannot be deleted. Use the matching audited reversal flow.");
        }

        List<UUID> recordIds = records.stream().map(PaymentRecord::getId).toList();
        if (!recordIds.isEmpty() && !allocationRepository
                .findByTenantIdAndPaymentRecordIdIn(cycle.getTenantId(), recordIds).isEmpty()) {
            throw new BusinessException(ErrorCode.CYCLE_HAS_PAYMENTS,
                    "This draw has payment allocation history and cannot be deleted. Void the related payment through its audited reversal flow.");
        }

        ChitServiceClient.DrawDependencyDto chitDependencies = chitServiceClient
                .getDrawDependencies(cycle.getChitId(), cycle.getMonthNumber());
        if (chitDependencies.hasHistory()) {
            throw new BusinessException(ErrorCode.CYCLE_NOT_DELETABLE,
                    "This draw has winner, auction, or processed reservation history and cannot be deleted. Use the matching audited void flow.");
        }
        var payoutDependencies = payoutServiceClient
                .getDrawDependencies(cycle.getChitId(), cycle.getMonthNumber());
        if (payoutDependencies.hasHistory()) {
            throw new BusinessException(ErrorCode.CYCLE_NOT_DELETABLE,
                    "This draw has payout history and cannot be deleted. Cancel or void the payout through its audited workflow.");
        }

        if (!recordIds.isEmpty()) {
            paymentRecordRepository.deleteByTenantIdAndChitIdAndMonthNumber(
                    cycle.getTenantId(), cycle.getChitId(), cycle.getMonthNumber());
        }

        drawRepository.delete(cycle);

        log.info("Actor {} ({}) deleted draw {} (draw {}) for chit {} — {} payment records removed",
                adminId, actorRole, cycleId, cycle.getMonthNumber(), cycle.getChitId(), records.size());

        auditClient.log("CHIT_DRAW",
                cycle.getChitId() + "-" + cycle.getMonthNumber(),
                cycle.getChitId().toString(),
                "DRAW_DELETED", adminId.toString(), actorRole,
                Map.of("status", "OPEN", "monthNumber", cycle.getMonthNumber()),
                null,
                com.chitfund.common.context.TenantContext.get());
    }

    @Transactional(readOnly = true)
    public Map<UUID, Integer> getLatestCycleNumbers(List<UUID> chitIds) {
        if (chitIds == null || chitIds.isEmpty()) return Map.of();
        return drawRepository.findMaxMonthNumberByTenantAndChitIds(requireTenantContext(), chitIds).stream()
                .collect(Collectors.toMap(
                        row -> (UUID) row[0],
                        row -> ((Number) row[1]).intValue()
                ));
    }

    @Transactional(readOnly = true)
    public List<PaymentRecordResponse> getCyclePayments(UUID cycleId) {
        ChitMonthDraw cycle = drawRepository.findByIdAndTenantId(cycleId, com.chitfund.common.context.TenantContext.get())
                .orElseThrow(() -> new ResourceNotFoundException("Cycle", cycleId));
        LocalDate today = LocalDate.now();
        return paymentRecordRepository
                .findByTenantIdAndChitIdAndMonthNumber(
                        cycle.getTenantId(), cycle.getChitId(), cycle.getMonthNumber())
                .stream()
                .map(r -> PaymentRecordResponse.builder()
                        .id(r.getId())
                        .chitId(r.getChitId())
                        .memberId(r.getMemberId())
                        .monthNumber(r.getMonthNumber())
                        .dueDate(r.getDueDate())
                        .grossInstallmentAmount(r.getGrossInstallmentAmount())
                        .dividendDeductedAmount(r.getDividendDeductedAmount())
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
                .collect(Collectors.toList());
    }

    private long count(List<PaymentRecord> records, PaymentRecordStatus status) {
        return records.stream().filter(r -> r.getStatus() == status).count();
    }

    private String requireTenantContext() {
        String tenantId = com.chitfund.common.context.TenantContext.get();
        requireTenant(tenantId);
        return tenantId;
    }

    /**
     * Never trust a client-supplied chit/member UUID list. The authenticated
     * tenant must own the chit and the request must cover exactly its active
     * members before any financial rows are created.
     */
    private ValidatedDrawInput validateChitAndMembers(UUID chitId, List<UUID> requestedMemberIds) {
        ChitServiceClient.ChitDto chit = chitServiceClient.getChit(chitId);
        if (chit == null || chit.getId() == null) {
            throw new BusinessException(ErrorCode.CHIT_NOT_FOUND, "Chit not found in this organization");
        }
        if (!"ACTIVE".equals(chit.getStatus())) {
            throw new BusinessException(ErrorCode.CHIT_NOT_ACTIVE, "Only an active chit can open or skip a draw");
        }
        if (chit.getDurationMonths() == null || chit.getDurationMonths() < 1) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED, "Chit duration is not configured");
        }

        Map<UUID, BigDecimal> amounts = chitServiceClient.getDrawMemberAmounts(chitId).stream()
                .filter(amount -> amount.getMemberId() != null && amount.getAmountDue() != null)
                .collect(Collectors.toMap(ChitServiceClient.MemberAmountDto::getMemberId,
                        ChitServiceClient.MemberAmountDto::getAmountDue, (left, right) -> left));
        java.util.Set<UUID> requested = new java.util.HashSet<>(requestedMemberIds);
        java.util.Set<UUID> active = amounts.keySet();
        if (requested.size() != requestedMemberIds.size() || !requested.equals(active)) {
            throw new BusinessException(ErrorCode.MEMBER_NOT_ENROLLED,
                    "Draw members must exactly match the chit's active members");
        }
        return new ValidatedDrawInput(chit, amounts);
    }

    private void validateOpenDrawContract(OpenMonthRequest request, ChitServiceClient.ChitDto chit,
                                          Map<UUID, BigDecimal> expected) {
        if (request.getMaxCycles() == null || !request.getMaxCycles().equals(chit.getDurationMonths())) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    "Draw cycle limit does not match the chit configuration");
        }
        if (chit.getInstallmentAmount() == null
                || request.getInstallmentAmount().compareTo(chit.getInstallmentAmount()) != 0) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    "Installment amount does not match the chit configuration");
        }
        boolean auctionChit = "AUCTION".equals(chit.getWinnerSelectionMode());
        if (auctionChit && !Objects.equals(request.getAuctionMode(), chit.getAuctionMode())) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    "Auction mode does not match the chit configuration");
        }
        if (!auctionChit && request.getAuctionMode() != null) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    "Auction mode is not allowed for this chit");
        }
        if (!auctionChit) {
            boolean amountsMatch = request.getMembers().stream().allMatch(member -> {
                BigDecimal canonical = expected.get(member.getMemberId());
                return canonical != null && canonical.compareTo(member.getAmountDue()) == 0;
            });
            if (!amountsMatch || expected.size() != request.getMembers().size()) {
                throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                        "Member amounts do not match the chit ledger configuration");
            }
        }
    }

    private record ValidatedDrawInput(ChitServiceClient.ChitDto chit,
                                      Map<UUID, BigDecimal> amounts) {}
}
