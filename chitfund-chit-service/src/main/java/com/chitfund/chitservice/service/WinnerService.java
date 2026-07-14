package com.chitfund.chitservice.service;

import com.chitfund.chitservice.domain.entity.Chit;
import com.chitfund.chitservice.domain.entity.MonthReservation;
import com.chitfund.chitservice.domain.entity.MonthlyWinner;
import com.chitfund.chitservice.domain.enums.ChitStatus;
import com.chitfund.chitservice.dto.request.AssignWinnerRequest;
import com.chitfund.chitservice.dto.request.ReserveMonthRequest;
import com.chitfund.chitservice.dto.response.MonthReservationResponse;
import com.chitfund.chitservice.dto.response.MonthlyWinnerResponse;
import com.chitfund.chitservice.mapper.ChitMapper;
import com.chitfund.chitservice.repository.ChitEnrollmentRepository;
import com.chitfund.chitservice.repository.MonthReservationRepository;
import com.chitfund.chitservice.repository.MonthlyWinnerRepository;
import com.chitfund.chitservice.strategy.WinnerSelectionStrategy;
import com.chitfund.chitservice.strategy.WinnerSelectionStrategyFactory;
import com.chitfund.common.exception.BusinessException;
import com.chitfund.common.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class WinnerService {

    private final ChitService chitService;
    private final ChitEnrollmentRepository enrollmentRepository;
    private final MonthlyWinnerRepository winnerRepository;
    private final MonthReservationRepository reservationRepository;
    private final WinnerSelectionStrategyFactory strategyFactory;
    private final ChitMapper chitMapper;

    @Transactional
    public MonthlyWinnerResponse assignWinner(UUID chitId, AssignWinnerRequest request, UUID assignedBy) {
        Chit chit = chitService.findById(chitId);

        if (chit.getStatus() != ChitStatus.ACTIVE && chit.getStatus() != ChitStatus.COMPLETED) {
            throw new BusinessException(ErrorCode.CHIT_NOT_ACTIVE);
        }
        if (request.getMonthNumber() < 1 || request.getMonthNumber() > chit.getDurationMonths()) {
            throw new BusinessException(ErrorCode.INVALID_MONTH_NUMBER);
        }
        // Enrolled spots per member (multi-spot members appear multiple times in the list)
        List<UUID> allMembers = enrollmentRepository.findActiveMemberIdsByChitId(chitId);
        Map<UUID, Long> spotCounts = allMembers.stream()
                .collect(Collectors.groupingBy(m -> m, Collectors.counting()));

        // Wins so far per member across all cycles in this chit
        List<UUID> allWins = winnerRepository.findWinnerMemberIdsByChitId(chitId);
        Map<UUID, Long> winCounts = allWins.stream()
                .collect(Collectors.groupingBy(m -> m, Collectors.counting()));

        // A member is eligible if they still have remaining spots (spots > wins)
        List<UUID> eligible = spotCounts.entrySet().stream()
                .filter(e -> winCounts.getOrDefault(e.getKey(), 0L) < e.getValue())
                .map(Map.Entry::getKey)
                .collect(Collectors.toList());

        // Strategy pattern: the right algorithm is selected by the chit's mode
        WinnerSelectionStrategy strategy = strategyFactory.getStrategy(chit.getWinnerSelectionMode());
        UUID winnerId = strategy.selectWinner(chit, eligible, request);

        BigDecimal discount = request.getDiscountAmount() != null ? request.getDiscountAmount() : BigDecimal.ZERO;
        // Use explicitly provided payout amount (from schedule slot) when given; fall back to chit total
        BigDecimal winningAmount = request.getWinningAmount() != null
                ? request.getWinningAmount()
                : chit.getTotalAmount().subtract(discount);

        MonthlyWinner winner = MonthlyWinner.builder()
                .chit(chit)
                .memberId(winnerId)
                .monthNumber(request.getMonthNumber())
                .selectionMode(chit.getWinnerSelectionMode())
                .winningAmount(winningAmount)
                .discountAmount(discount.compareTo(BigDecimal.ZERO) > 0 ? discount : null)
                .assignedBy(assignedBy)
                .build();

        MonthlyWinner saved = winnerRepository.save(winner);
        return chitMapper.toWinnerResponse(saved);
    }

    public List<MonthlyWinnerResponse> listWinners(UUID chitId) {
        chitService.findById(chitId);
        return winnerRepository.findByChitIdOrderByMonthNumberAsc(chitId)
                .stream().map(chitMapper::toWinnerResponse).collect(Collectors.toList());
    }

    @Transactional
    public void deleteWinnerForDraw(UUID chitId, Integer monthNumber) {
        // No-op if no winner was recorded — non-fatal when called as part of cycle deletion
        winnerRepository.deleteByChitIdAndMonthNumber(chitId, monthNumber);
    }

    @Transactional
    public MonthReservationResponse reserveMonth(UUID chitId, ReserveMonthRequest request, UUID createdBy) {
        Chit chit = chitService.findById(chitId);

        if (chit.getStatus() != ChitStatus.ACTIVE) {
            throw new BusinessException(ErrorCode.CHIT_NOT_ACTIVE);
        }
        if (request.getMonthNumber() < 1 || request.getMonthNumber() > chit.getDurationMonths()) {
            throw new BusinessException(ErrorCode.INVALID_MONTH_NUMBER);
        }
        if (!enrollmentRepository.existsByChitIdAndMemberIdAndActiveTrue(chitId, request.getMemberId())) {
            throw new BusinessException(ErrorCode.MEMBER_NOT_ENROLLED);
        }
        if (reservationRepository.existsByChitIdAndMemberIdAndStatusNot(
                chitId, request.getMemberId(), com.chitfund.chitservice.domain.enums.ReservationStatus.VOIDED)) {
            throw new BusinessException(ErrorCode.MEMBER_ALREADY_HAS_RESERVATION);
        }
        if (winnerRepository.existsByChitIdAndMonthNumber(chitId, request.getMonthNumber())) {
            throw new BusinessException(ErrorCode.MONTH_ALREADY_ASSIGNED,
                    "Draw " + request.getMonthNumber() + " already has a winner assigned");
        }

        try {
            MonthReservation reservation = MonthReservation.builder()
                    .chit(chit)
                    .memberId(request.getMemberId())
                    .monthNumber(request.getMonthNumber())
                    .createdBy(createdBy)
                    .build();
            return chitMapper.toReservationResponse(reservationRepository.save(reservation));
        } catch (ObjectOptimisticLockingFailureException e) {
            // Two members tried to reserve the same month simultaneously — only one wins
            throw new BusinessException(ErrorCode.MONTH_ALREADY_RESERVED);
        }
    }

    public List<MonthReservationResponse> listReservations(UUID chitId) {
        chitService.findById(chitId);
        return reservationRepository.findByChitIdOrderByReservationMonthAscMonthNumberAsc(chitId)
                .stream().map(chitMapper::toReservationResponse).collect(Collectors.toList());
    }
}
