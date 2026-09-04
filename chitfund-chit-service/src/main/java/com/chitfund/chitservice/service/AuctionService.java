package com.chitfund.chitservice.service;

import com.chitfund.chitservice.client.NotificationClient;
import com.chitfund.chitservice.client.PaymentServiceClient;
import com.chitfund.chitservice.domain.entity.AuctionBid;
import com.chitfund.chitservice.domain.entity.AuctionSession;
import com.chitfund.chitservice.domain.entity.Chit;
import com.chitfund.chitservice.domain.enums.AuctionMode;
import com.chitfund.chitservice.domain.enums.AuctionStatus;
import com.chitfund.chitservice.domain.enums.ChitStatus;
import com.chitfund.chitservice.domain.enums.WinnerSelectionMode;
import com.chitfund.chitservice.dto.request.AssignWinnerRequest;
import com.chitfund.chitservice.dto.request.CloseAuctionRequest;
import com.chitfund.chitservice.dto.request.OpenAuctionRequest;
import com.chitfund.chitservice.dto.request.PlaceBidRequest;
import com.chitfund.chitservice.dto.response.AuctionBidResponse;
import com.chitfund.chitservice.dto.response.AuctionSessionResponse;
import com.chitfund.chitservice.repository.AuctionBidRepository;
import com.chitfund.chitservice.repository.AuctionSessionRepository;
import com.chitfund.chitservice.repository.ChitEnrollmentRepository;
import com.chitfund.chitservice.repository.MonthlyWinnerRepository;
import com.chitfund.common.context.TenantContext;
import com.chitfund.common.exception.BusinessException;
import com.chitfund.common.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
@Transactional(readOnly = true)
public class AuctionService {

    private final ChitService chitService;
    private final AuctionSessionRepository auctionSessionRepository;
    private final AuctionBidRepository auctionBidRepository;
    private final ChitEnrollmentRepository enrollmentRepository;
    private final MonthlyWinnerRepository winnerRepository;
    private final WinnerService winnerService;
    private final PaymentServiceClient paymentServiceClient;
    private final SimpMessagingTemplate messagingTemplate;
    private final NotificationClient notificationClient;
    private final com.chitfund.chitservice.client.AuditClient auditClient;

    @Transactional
    public AuctionSessionResponse openAuction(UUID chitId, OpenAuctionRequest request, UUID openedBy) {
        Chit chit = chitService.findByIdScoped(chitId);
        validateAuctionChit(chit);

        if (auctionSessionRepository.existsByChitIdAndMonthNumberAndStatus(
                chitId, request.getMonthNumber(), AuctionStatus.OPEN)) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    "An auction is already open for month " + request.getMonthNumber());
        }
        // Block re-open only if CLOSED (not VOIDED — voided sessions allow a fresh auction)
        if (auctionSessionRepository.findByChitIdAndMonthNumber(chitId, request.getMonthNumber())
                .filter(s -> s.getStatus() == AuctionStatus.CLOSED).isPresent()) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    "Auction for month " + request.getMonthNumber() + " is already closed. Use Re-auction to void it first.");
        }

        // Normalise commission: reject invalid types; PERCENTAGE cap validated at service layer
        String commType = request.getCommissionType();
        BigDecimal commValue = request.getCommissionValue();
        if (commType != null && !commType.equals("FIXED") && !commType.equals("PERCENTAGE")) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED, "commissionType must be FIXED or PERCENTAGE");
        }
        if (commType != null && (commValue == null || commValue.compareTo(BigDecimal.ZERO) <= 0)) {
            commType  = null;
            commValue = null;
        }

        AuctionSession session = AuctionSession.builder()
                .tenantId(TenantContext.get())
                .chitId(chitId)
                .monthNumber(request.getMonthNumber())
                .scheduledPayoutAmount(request.getScheduledPayoutAmount())
                .minBidStep(request.getMinBidStep())
                .auctionMode(chit.getAuctionMode())
                .status(AuctionStatus.OPEN)
                .commissionType(commType)
                .commissionValue(commValue)
                .showCommissionToMembers(request.isShowCommissionToMembers())
                .openedBy(openedBy)
                .openedAt(LocalDateTime.now())
                .closesAt(request.getClosesAt())
                .build();

        AuctionSession saved = auctionSessionRepository.save(session);
        log.info("Auction opened: id={} chit={} month={} scheduledPayout={} minBidStep={} mode={} closesAt={} openedBy={}",
                saved.getId(), chitId, request.getMonthNumber(),
                request.getScheduledPayoutAmount(), request.getMinBidStep(),
                chit.getAuctionMode(), request.getClosesAt(), openedBy);

        auditClient.log("AUCTION_SESSION", saved.getId().toString(), chitId.toString(),
                "AUCTION_OPENED", openedBy != null ? openedBy.toString() : null, null,
                null,
                Map.of("monthNumber", saved.getMonthNumber(),
                        "scheduledPayoutAmount", saved.getScheduledPayoutAmount().toPlainString(),
                        "chitId", chitId.toString()),
                TenantContext.get());

        int totalSpots = (int) enrollmentRepository.countByChitIdAndActiveTrue(chitId);
        return toResponse(saved, List.of(), totalSpots);
    }

    @Transactional
    public AuctionSessionResponse placeBid(UUID chitId, UUID auctionId, PlaceBidRequest request, UUID memberId) {
        AuctionSession session = getOpenSessionForUpdate(auctionId, chitId);
        String tenantId = session.getTenantId();

        if (session.getClosesAt() != null && LocalDateTime.now().isAfter(session.getClosesAt())) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    "This auction has ended — bidding is closed. Admin will announce the winner.");
        }

        if (!enrollmentRepository.existsByChitIdAndMemberIdAndActiveTrue(chitId, memberId)) {
            throw new BusinessException(ErrorCode.MEMBER_NOT_ENROLLED, "You are not enrolled in this chit");
        }

        // Members who already won cannot bid
        List<UUID> pastWinners = winnerRepository.findWinnerMemberIdsByChitId(chitId);
        if (pastWinners.contains(memberId)) {
            throw new BusinessException(ErrorCode.MEMBER_ALREADY_WON, "You have already won in this chit");
        }

        BigDecimal discount = session.getScheduledPayoutAmount().subtract(request.getBidAmount());
        if (discount.compareTo(BigDecimal.ZERO) <= 0) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    "Bid amount must be less than the scheduled payout of ₹" + session.getScheduledPayoutAmount());
        }

        // Must beat the current best by at least minBidStep (if set)
        Optional<AuctionBid> currentBest = auctionBidRepository
                .findTopByAuctionSessionIdAndTenantIdOrderByDiscountOfferedDescBidTimeAsc(auctionId, tenantId);
        if (currentBest.isPresent()) {
            BigDecimal step = session.getMinBidStep() != null ? session.getMinBidStep() : BigDecimal.ONE;
            BigDecimal maxAllowed = currentBest.get().getBidAmount().subtract(step);
            if (request.getBidAmount().compareTo(maxAllowed) > 0) {
                if (session.getMinBidStep() != null && session.getMinBidStep().compareTo(BigDecimal.ONE) > 0) {
                    throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                            "Minimum bid step is ₹" + session.getMinBidStep() + ". You must bid ₹"
                                    + maxAllowed + " or lower to compete. Current best: ₹" + currentBest.get().getBidAmount());
                } else {
                    throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                            "Your bid of ₹" + request.getBidAmount() + " does not beat the current best offer of ₹"
                                    + currentBest.get().getBidAmount() + ". Bid lower to win.");
                }
            }
        }

        AuctionBid bid = AuctionBid.builder()
                .tenantId(tenantId)
                .auctionSessionId(auctionId)
                .chitId(chitId)
                .memberId(memberId)
                .bidAmount(request.getBidAmount())
                .discountOffered(discount)
                .build();
        auctionBidRepository.save(bid);

        String proxyNote = (request.getOnBehalfOfMemberId() != null)
                ? " [proxy bid by admin]" : "";
        log.info("Bid placed: id={} auction={} chit={} member={} bidAmount={} discount={} prevBest={}{}",
                bid.getId(), auctionId, chitId, memberId, request.getBidAmount(), discount,
                currentBest.map(b -> b.getBidAmount().toPlainString()).orElse("none"), proxyNote);

        AuctionSessionResponse response = buildResponse(session);
        // Broadcast to all viewers of this auction room
        messagingTemplate.convertAndSend("/topic/auction/" + auctionId, response);

        String auctionLink = "/chits/" + chitId + "/auction/" + auctionId;

        // Notify the previous leader that they've been outbid
        UUID previousLeaderId = currentBest.map(AuctionBid::getMemberId).orElse(null);
        if (previousLeaderId != null && !previousLeaderId.equals(memberId)) {
            notificationClient.notifyUsersInApp(
                List.of(previousLeaderId.toString()),
                "AUCTION_OUTBID",
                "You've been outbid!",
                "Someone placed a lower bid of ₹" + request.getBidAmount() + ". Bid again to take the lead.",
                auctionLink
            );
        }

        // Notify the new bidder they're now winning
        notificationClient.notifyUsersInApp(
            List.of(memberId.toString()),
            "AUCTION_WINNING",
            "You're winning! 🏆",
            "Your bid of ₹" + request.getBidAmount() + " is the lowest — you currently hold the lead.",
            auctionLink
        );

        return response;
    }

    public AuctionSessionResponse getAuction(UUID chitId, UUID auctionId) {
        AuctionSession session = auctionSessionRepository
                .findByIdAndChitIdAndTenantId(auctionId, chitId, TenantContext.get())
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND, "Auction not found"));
        return buildResponse(session);
    }

    public List<AuctionSessionResponse> listAuctions(UUID chitId) {
        chitService.findByIdScoped(chitId);
        return auctionSessionRepository.findByChitIdAndTenantIdOrderByMonthNumberAsc(
                        chitId, TenantContext.get()).stream()
                .map(this::buildResponse)
                .collect(Collectors.toList());
    }

    @Transactional
    public AuctionSessionResponse closeAuction(UUID chitId, UUID auctionId,
                                               CloseAuctionRequest request, UUID closedBy) {
        AuctionSession session = getOpenSessionForUpdate(auctionId, chitId);
        String auctionTenantId = session.getTenantId();
        Chit chit = chitService.findByIdScoped(chitId);

        UUID winnerId;
        BigDecimal wonAmount;

        if (session.getAuctionMode() == AuctionMode.OFFLINE) {
            // Admin manually provides winner + won amount
            if (request.getWinnerId() == null || request.getWonAmount() == null) {
                throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                        "winnerId and wonAmount are required to close an offline auction");
            }
            winnerId = request.getWinnerId();
            wonAmount = request.getWonAmount();
        } else {
            // ONLINE: take the highest-discount bid
            AuctionBid winningBid = auctionBidRepository
                    .findTopByAuctionSessionIdAndTenantIdOrderByDiscountOfferedDescBidTimeAsc(
                            auctionId, auctionTenantId)
                    .orElseThrow(() -> new BusinessException(ErrorCode.VALIDATION_FAILED,
                            "Cannot close auction — no bids placed yet"));
            winnerId = winningBid.getMemberId();
            wonAmount = winningBid.getBidAmount();
        }

        BigDecimal discount = session.getScheduledPayoutAmount().subtract(wonAmount);

        // Resolve admin commission to a ₹ amount
        BigDecimal commissionAmount = BigDecimal.ZERO;
        if (session.getCommissionType() != null && session.getCommissionValue() != null
                && session.getCommissionValue().compareTo(BigDecimal.ZERO) > 0) {
            if ("PERCENTAGE".equals(session.getCommissionType())) {
                commissionAmount = discount
                        .multiply(session.getCommissionValue())
                        .divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP);
            } else { // FIXED
                commissionAmount = session.getCommissionValue();
            }
            // Commission cannot exceed the discount (prevents negative distributable amount)
            commissionAmount = commissionAmount.min(discount);
        }

        // Total spots across all enrolled members
        List<UUID> allSpots = enrollmentRepository.findActiveMemberIdsByChitId(chitId);
        int totalSpots = allSpots.size();
        BigDecimal distributableDiscount = discount.subtract(commissionAmount);
        BigDecimal dividendPerSpot = totalSpots > 0
                ? distributableDiscount.divide(BigDecimal.valueOf(totalSpots), 2, RoundingMode.DOWN)
                : BigDecimal.ZERO;

        session.setCommissionAmount(commissionAmount);
        session.setStatus(AuctionStatus.CLOSED);
        session.setWinnerId(winnerId);
        session.setWonAmount(wonAmount);
        session.setDiscountAmount(discount);
        session.setDividendPerSpot(dividendPerSpot);
        session.setClosedBy(closedBy);
        session.setClosedAt(LocalDateTime.now());
        auctionSessionRepository.save(session);

        // Record winner in chit-service (existing WinnerService)
        AssignWinnerRequest winnerRequest = new AssignWinnerRequest();
        winnerRequest.setWinnerId(winnerId);
        winnerRequest.setMonthNumber(session.getMonthNumber());
        winnerRequest.setDiscountAmount(discount);
        winnerRequest.setWinningAmount(wonAmount);
        winnerService.assignWinner(chitId, winnerRequest, closedBy);

        // Build member-spot map for payment-service: distinct members with their spot counts
        Map<UUID, Long> spotCounts = allSpots.stream()
                .collect(Collectors.groupingBy(id -> id, Collectors.counting()));

        BigDecimal grossInstallment = chit.getInstallmentAmount();
        List<PaymentServiceClient.MemberSpot> memberSpots = spotCounts.entrySet().stream()
                .map(e -> new PaymentServiceClient.MemberSpot(e.getKey(), e.getValue().intValue()))
                .collect(Collectors.toList());

        // Trigger payment record creation in payment-service
        // TenantContext may be null when called from scheduler (no JWT) — fall back to chit's tenantId
        String tenantId = TenantContext.get() != null ? TenantContext.get() : chit.getTenantId();
        paymentServiceClient.applyAuctionDividend(
                chitId, session.getMonthNumber(),
                grossInstallment, dividendPerSpot,
                memberSpots, tenantId);

        log.info("Auction closed: id={} chit={} month={} mode={} winner={} scheduledPayout={} wonAmount={} discount={} commission={} distributable={} totalSpots={} dividendPerSpot={} closedBy={}",
                auctionId, chitId, session.getMonthNumber(), session.getAuctionMode(),
                winnerId, session.getScheduledPayoutAmount(), wonAmount, discount,
                commissionAmount, distributableDiscount, totalSpots, dividendPerSpot, closedBy);

        auditClient.log("AUCTION_SESSION", auctionId.toString(), chitId.toString(),
                "AUCTION_CLOSED", closedBy != null ? closedBy.toString() : null, null,
                null,
                Map.of("monthNumber", session.getMonthNumber(),
                        "winnerId", winnerId.toString(),
                        "wonAmount", wonAmount.toPlainString(),
                        "discountAmount", discount.toPlainString()),
                tenantId);

        AuctionSessionResponse response = buildResponse(session);
        messagingTemplate.convertAndSend("/topic/auction/" + auctionId, response);

        // Notify auction participants
        String chitLink = "/chits/" + chitId;
        notificationClient.notifyUsersInApp(
            List.of(winnerId.toString()),
            "AUCTION_WON",
            "You won the auction! 🎉",
            "You won Draw #" + session.getMonthNumber() + " at ₹" + wonAmount + ". Payout will be processed shortly.",
            chitLink
        );

        List<String> otherBidderIds = auctionBidRepository
            .findByAuctionSessionIdAndTenantIdOrderByDiscountOfferedDescBidTimeAsc(
                    auctionId, auctionTenantId).stream()
            .map(b -> b.getMemberId().toString())
            .filter(id -> !id.equals(winnerId.toString()))
            .distinct()
            .collect(Collectors.toList());
        if (!otherBidderIds.isEmpty()) {
            notificationClient.notifyUsersInApp(
                otherBidderIds,
                "AUCTION_LOST",
                "Auction closed",
                "Draw #" + session.getMonthNumber() + " ended. Better luck next draw!",
                chitLink
            );
        }

        return response;
    }

    @Transactional
    public AuctionSessionResponse extendAuction(UUID chitId, UUID auctionId, int additionalMinutes, UUID adminId) {
        AuctionSession session = auctionSessionRepository
                .findByIdAndChitIdAndTenantIdForUpdate(auctionId, chitId, TenantContext.get())
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND, "Auction session not found"));

        if (session.getAuctionMode() != AuctionMode.ONLINE) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED, "Timer is only supported for ONLINE auctions");
        }
        if (session.getStatus() == AuctionStatus.VOIDED) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED, "Cannot extend a voided auction");
        }

        // If session was auto-closed by timer, reopen it (reverse the close effects)
        if (session.getStatus() == AuctionStatus.CLOSED) {
            reopenClosedSession(chitId, session, adminId);
        }

        LocalDateTime newClosesAt = LocalDateTime.now().plusMinutes(additionalMinutes);
        session.setClosesAt(newClosesAt);
        auctionSessionRepository.save(session);
        log.info("Auction timer extended: id={} chit={} newClosesAt={} by={}", auctionId, chitId, newClosesAt, adminId);
        AuctionSessionResponse response = buildResponse(session);
        messagingTemplate.convertAndSend("/topic/auction/" + auctionId, response);
        return response;
    }

    @Transactional
    public AuctionSessionResponse voidAuction(UUID chitId, UUID auctionId, UUID adminId) {
        AuctionSession session = auctionSessionRepository
                .findByIdAndChitIdAndTenantIdForUpdate(auctionId, chitId, TenantContext.get())
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND, "Auction session not found"));

        if (session.getStatus() == AuctionStatus.VOIDED) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED, "Auction is already voided");
        }
        if (session.getStatus() == AuctionStatus.OPEN) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED, "Close the auction before voiding it");
        }

        reopenClosedSession(chitId, session, adminId);
        session.setStatus(AuctionStatus.VOIDED);
        auctionSessionRepository.save(session);

        log.info("Auction voided: id={} chit={} month={} by={}", auctionId, chitId, session.getMonthNumber(), adminId);

        auditClient.log("AUCTION_SESSION", auctionId.toString(), chitId.toString(),
                "AUCTION_VOIDED", adminId != null ? adminId.toString() : null, null,
                Map.of("monthNumber", session.getMonthNumber(), "status", "VOIDED"),
                null,
                TenantContext.get());

        return buildResponse(session);
    }

    private void reopenClosedSession(UUID chitId, AuctionSession session, UUID adminId) {
        // Reverse winner record
        winnerService.deleteWinnerForDraw(chitId, session.getMonthNumber());
        // Reverse payment records in payment service
        paymentServiceClient.reverseAuctionDividend(chitId, session.getMonthNumber(), TenantContext.get());
        // Clear close-related fields and reopen
        session.setStatus(AuctionStatus.OPEN);
        session.setWinnerId(null);
        session.setWonAmount(null);
        session.setDiscountAmount(null);
        session.setDividendPerSpot(null);
        session.setCommissionAmount(null);
        session.setClosedBy(null);
        session.setClosedAt(null);
        log.info("Auction session reopened: id={} chit={} month={} by={}", session.getId(), chitId, session.getMonthNumber(), adminId);
    }


    // ── Private helpers ────────────────────────────────────────────────────────

    private AuctionSession getOpenSessionForUpdate(UUID auctionId, UUID chitId) {
        AuctionSession session = auctionSessionRepository
                .findByIdAndChitIdAndTenantIdForUpdate(auctionId, chitId, TenantContext.get())
                .orElseThrow(() -> new BusinessException(ErrorCode.RESOURCE_NOT_FOUND, "Auction session not found"));
        if (session.getStatus() != AuctionStatus.OPEN) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED, "Auction is not open");
        }
        return session;
    }

    private void validateAuctionChit(Chit chit) {
        if (chit.getWinnerSelectionMode() != WinnerSelectionMode.AUCTION) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED, "This chit does not use auction-based winner selection");
        }
        if (chit.getStatus() != ChitStatus.ACTIVE) {
            throw new BusinessException(ErrorCode.CHIT_NOT_ACTIVE);
        }
    }

    private AuctionSessionResponse buildResponse(AuctionSession session) {
        List<AuctionBid> bids = auctionBidRepository
                .findByAuctionSessionIdAndTenantIdOrderByDiscountOfferedDescBidTimeAsc(
                        session.getId(), session.getTenantId());

        UUID winningBidMemberId = bids.isEmpty() ? null : bids.get(0).getMemberId();

        List<AuctionBidResponse> bidResponses = bids.stream()
                .map(b -> AuctionBidResponse.builder()
                        .id(b.getId())
                        .memberId(b.getMemberId())
                        .bidAmount(b.getBidAmount())
                        .discountOffered(b.getDiscountOffered())
                        .bidTime(b.getBidTime())
                        .winning(b.getMemberId().equals(winningBidMemberId))
                        .build())
                .collect(Collectors.toList());

        // Count total slots (one per enrollment row — multi-spot members appear multiple times)
        int totalSpots = (int) enrollmentRepository.countByChitIdAndActiveTrue(session.getChitId());

        return toResponse(session, bidResponses, totalSpots);
    }

    private AuctionSessionResponse toResponse(AuctionSession session, List<AuctionBidResponse> bids, int totalSpots) {
        return AuctionSessionResponse.builder()
                .id(session.getId())
                .chitId(session.getChitId())
                .monthNumber(session.getMonthNumber())
                .scheduledPayoutAmount(session.getScheduledPayoutAmount())
                .minBidStep(session.getMinBidStep())
                .auctionMode(session.getAuctionMode())
                .status(session.getStatus())
                .winnerId(session.getWinnerId())
                .wonAmount(session.getWonAmount())
                .discountAmount(session.getDiscountAmount())
                .dividendPerSpot(session.getDividendPerSpot())
                .commissionType(session.getCommissionType())
                .commissionValue(session.getCommissionValue())
                .commissionAmount(session.getCommissionAmount())
                .showCommissionToMembers(session.isShowCommissionToMembers())
                .openedAt(session.getOpenedAt())
                .closedAt(session.getClosedAt())
                .closesAt(session.getClosesAt())
                .bids(bids)
                .totalSpots(totalSpots)
                .build();
    }
}
