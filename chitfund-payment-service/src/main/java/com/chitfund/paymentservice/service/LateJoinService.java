package com.chitfund.paymentservice.service;

import com.chitfund.paymentservice.client.ChitServiceClient;
import com.chitfund.paymentservice.domain.ChitMonthDraw;
import com.chitfund.paymentservice.domain.PaymentRecord;
import com.chitfund.paymentservice.domain.enums.DrawStatus;
import com.chitfund.paymentservice.domain.enums.PaymentRecordStatus;
import com.chitfund.paymentservice.dto.response.LateJoinPreviewResponse;
import com.chitfund.paymentservice.dto.response.LateJoinPreviewResponse.CatchUpInstallmentItem;
import com.chitfund.paymentservice.repository.ChitMonthDrawRepository;
import com.chitfund.paymentservice.repository.PaymentRecordRepository;
import com.chitfund.common.exception.BusinessException;
import com.chitfund.common.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class LateJoinService {

    private static final String CATCH_UP_SOURCE = "LATE_JOIN";

    private final ChitMonthDrawRepository drawRepository;
    private final PaymentRecordRepository paymentRecordRepository;
    private final MemberCreditService memberCreditService;
    private final ChitServiceClient chitServiceClient;

    // ── Preview (read-only, no side effects) ─────────────────────────────────

    @Transactional(readOnly = true)
    public LateJoinPreviewResponse preview(UUID chitId, UUID memberId, String tenantId) {
        ChitServiceClient.ChitDto chit = chitServiceClient.getChit(chitId);
        if (chit == null) {
            throw new BusinessException(ErrorCode.RESOURCE_NOT_FOUND,
                    "Chit not found: " + chitId, HttpStatus.NOT_FOUND);
        }
        if (!"ACTIVE".equals(chit.getStatus())) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    "Late-join preview is only available for ACTIVE chits (current status: " + chit.getStatus() + ")",
                    HttpStatus.BAD_REQUEST);
        }

        boolean isAuction = "AUCTION".equalsIgnoreCase(chit.getWinnerSelectionMode());
        List<ChitMonthDraw> draws = drawRepository.findByTenantIdAndChitIdOrderByMonthNumberAsc(tenantId, chitId);

        List<CatchUpInstallmentItem> items = new ArrayList<>();
        int alreadyPosted = 0;

        for (ChitMonthDraw draw : draws) {
            if (draw.getStatus() == DrawStatus.SKIPPED) continue;
            if (draw.getStatus() == DrawStatus.AWAITING_AUCTION) {
                // Auction for this month hasn't closed yet — `applyAuctionDividend` will
                // include the now-enrolled member automatically when it runs.
                continue;
            }

            Optional<PaymentRecord> existing = paymentRecordRepository
                    .findByTenantIdAndChitIdAndMemberIdAndMonthNumber(
                            tenantId, chitId, memberId, draw.getMonthNumber());

            if (existing.isPresent()) {
                alreadyPosted++;
                items.add(CatchUpInstallmentItem.builder()
                        .monthNumber(draw.getMonthNumber())
                        .dueDate(draw.getDueDate())
                        .grossAmount(existing.get().getAmountDue())
                        .amountDue(existing.get().getAmountDue())
                        .drawStatus(draw.getStatus().name())
                        .alreadyPosted(true)
                        .build());
                continue;
            }

            ResolvedAmounts amounts = resolveAmounts(tenantId, chitId, draw, isAuction);
            items.add(CatchUpInstallmentItem.builder()
                    .monthNumber(draw.getMonthNumber())
                    .dueDate(draw.getDueDate())
                    .grossAmount(amounts.gross())
                    .dividendDeductedAmount(amounts.dividend())
                    .amountDue(amounts.net())
                    .drawStatus(draw.getStatus().name())
                    .alreadyPosted(false)
                    .build());
        }

        BigDecimal totalCatchUp = items.stream()
                .filter(i -> !i.isAlreadyPosted())
                .map(CatchUpInstallmentItem::getAmountDue)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        BigDecimal creditBalance = memberCreditService.getBalance(memberId);
        BigDecimal creditApplicable = creditBalance.min(totalCatchUp);
        BigDecimal netCash = totalCatchUp.subtract(creditApplicable);
        if (netCash.compareTo(BigDecimal.ZERO) < 0) netCash = BigDecimal.ZERO;

        return LateJoinPreviewResponse.builder()
                .chitId(chitId)
                .memberId(memberId)
                .chitName(chit.getName())
                .winnerSelectionMode(chit.getWinnerSelectionMode())
                .catchUpInstallments(items)
                .existingCreditBalance(creditBalance)
                .totalCatchUpAmount(totalCatchUp)
                .creditApplicable(creditApplicable)
                .netCashRequired(netCash)
                .alreadyPostedMonths(alreadyPosted)
                .build();
    }

    // ── Posting (idempotent, transactional) ───────────────────────────────────

    /**
     * Creates catch-up PaymentRecord rows for every opened, non-skipped draw that
     * the member has no record for yet. Safe to call multiple times — skips existing.
     *
     * @return number of new records created
     */
    @Transactional
    public int createDues(UUID chitId, UUID memberId, String tenantId, UUID actorId) {
        ChitServiceClient.ChitDto chit = chitServiceClient.getChit(chitId);
        if (chit == null) {
            throw new BusinessException(ErrorCode.RESOURCE_NOT_FOUND,
                    "Chit not found: " + chitId, HttpStatus.NOT_FOUND);
        }
        if (!"ACTIVE".equals(chit.getStatus())) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    "Late-join dues can only be created for ACTIVE chits", HttpStatus.BAD_REQUEST);
        }

        boolean isAuction = "AUCTION".equalsIgnoreCase(chit.getWinnerSelectionMode());
        List<ChitMonthDraw> draws = drawRepository.findByTenantIdAndChitIdOrderByMonthNumberAsc(tenantId, chitId);

        List<PaymentRecord> toCreate = new ArrayList<>();

        for (ChitMonthDraw draw : draws) {
            if (draw.getStatus() == DrawStatus.SKIPPED) continue;
            if (draw.getStatus() == DrawStatus.AWAITING_AUCTION) continue;

            // Pessimistic lock — prevents duplicate creation under concurrent approvals
            Optional<PaymentRecord> existing = paymentRecordRepository
                    .findByTenantIdAndChitIdAndMemberIdAndMonthNumberForUpdate(
                            tenantId, chitId, memberId, draw.getMonthNumber());
            if (existing.isPresent()) {
                log.debug("Late-join skip — record already exists for chit {} member {} month {}",
                        chitId, memberId, draw.getMonthNumber());
                continue;
            }

            ResolvedAmounts amounts = resolveAmounts(tenantId, chitId, draw, isAuction);

            // Do NOT apply credit here — FIFO ordering across chits requires a single global
            // credit pass at payment time. Creating credit-covered rows here would violate
            // the oldest-first invariant for dues in other chits.
            toCreate.add(PaymentRecord.builder()
                    .tenantId(tenantId)
                    .chitId(chitId)
                    .memberId(memberId)
                    .monthNumber(draw.getMonthNumber())
                    .dueDate(draw.getDueDate())
                    .grossInstallmentAmount(amounts.gross())
                    .dividendDeductedAmount(amounts.dividend())
                    .amountDue(amounts.net())
                    .amountPaid(BigDecimal.ZERO)
                    .status(PaymentRecordStatus.OUTSTANDING)
                    .catchUpSource(CATCH_UP_SOURCE)
                    .build());
        }

        if (!toCreate.isEmpty()) {
            try {
                paymentRecordRepository.saveAll(toCreate);
                log.info("Late-join: created {} catch-up record(s) for member {} in chit {} (actor {})",
                        toCreate.size(), memberId, chitId, actorId);
            } catch (DataIntegrityViolationException e) {
                // Concurrent call already created the same records — idempotent, treat as success.
                log.info("Late-join: duplicate key on saveAll for member {} chit {} — concurrent call already created records",
                        memberId, chitId);
                return 0;
            }
        }
        return toCreate.size();
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private ResolvedAmounts resolveAmounts(String tenantId, UUID chitId,
                                           ChitMonthDraw draw, boolean isAuction) {
        if (!isAuction) {
            BigDecimal amt = draw.getInstallmentAmount();
            return new ResolvedAmounts(amt, null, amt);
        }

        // For AUCTION draws, derive per-spot amounts from a peer record.
        // A peer may hold multiple spots; gross/dividend in their record aggregates all spots.
        // Divide by spot count (peer.grossInstallmentAmount / draw.installmentAmount) to get
        // the single-spot dividend that applies to this joining member.
        List<PaymentRecord> peers = paymentRecordRepository
                .findByTenantIdAndChitIdAndMonthNumber(tenantId, chitId, draw.getMonthNumber());

        if (!peers.isEmpty()) {
            PaymentRecord ref = peers.get(0);
            BigDecimal drawGrossPerSpot = draw.getInstallmentAmount();
            BigDecimal peerSpots = (ref.getGrossInstallmentAmount() != null
                    && drawGrossPerSpot.compareTo(BigDecimal.ZERO) != 0)
                    ? ref.getGrossInstallmentAmount().divide(drawGrossPerSpot, 0, RoundingMode.HALF_UP)
                    : BigDecimal.ONE;
            if (peerSpots.compareTo(BigDecimal.ZERO) <= 0) peerSpots = BigDecimal.ONE;
            BigDecimal dividendPerSpot = (ref.getDividendDeductedAmount() != null
                    && peerSpots.compareTo(BigDecimal.ZERO) > 0)
                    ? ref.getDividendDeductedAmount().divide(peerSpots, 2, RoundingMode.HALF_UP)
                    : BigDecimal.ZERO;
            BigDecimal netPerSpot = drawGrossPerSpot.subtract(dividendPerSpot);
            return new ResolvedAmounts(drawGrossPerSpot, dividendPerSpot, netPerSpot);
        }

        // No peer records yet (all members joined late?). Fall back to gross installment.
        BigDecimal gross = draw.getInstallmentAmount();
        return new ResolvedAmounts(gross, null, gross);
    }

    private record ResolvedAmounts(BigDecimal gross, BigDecimal dividend, BigDecimal net) {}
}
