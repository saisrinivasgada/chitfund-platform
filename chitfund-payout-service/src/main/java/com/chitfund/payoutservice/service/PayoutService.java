package com.chitfund.payoutservice.service;

import com.chitfund.common.event.PayoutCreatedEvent;
import com.chitfund.common.event.PayoutDisbursedEvent;
import com.chitfund.common.exception.BusinessException;
import com.chitfund.common.exception.ErrorCode;
import com.chitfund.payoutservice.domain.Payout;
import com.chitfund.payoutservice.domain.enums.DisbursementMode;
import com.chitfund.payoutservice.domain.enums.PayoutStatus;
import com.chitfund.payoutservice.dto.request.CancelPayoutRequest;
import com.chitfund.payoutservice.dto.request.CreatePayoutRequest;
import com.chitfund.payoutservice.dto.request.DisburseRequest;
import com.chitfund.payoutservice.dto.response.PayoutResponse;
import com.chitfund.payoutservice.kafka.PayoutEventPublisher;
import com.chitfund.payoutservice.repository.PayoutRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class PayoutService {

    private final PayoutRepository payoutRepository;
    private final PayoutEventPublisher eventPublisher;

    /**
     * Admin registers a payout obligation after the winner is announced in chit-service.
     * netPayoutAmount is computed here — admin only provides winning and discount amounts.
     *
     * WHY not compute this in chit-service and push here?
     * Separation of concerns: chit-service decides WHO won. Payout-service handles MONEY.
     * In the future, Kafka will carry the WinnerSelectedEvent and this method becomes
     * a Kafka consumer, called automatically. For now, admin calls it manually.
     */
    @Transactional
    public PayoutResponse createPayout(CreatePayoutRequest request, UUID adminId) {
        if (payoutRepository.existsByChitIdAndMonthNumberAndStatusNot(
                request.getChitId(), request.getMonthNumber(), PayoutStatus.CANCELLED)) {
            throw new BusinessException(ErrorCode.PAYOUT_ALREADY_EXISTS,
                    "An active payout already exists for chit " + request.getChitId()
                    + " cycle " + request.getMonthNumber());
        }

        if (request.getDiscountAmount().compareTo(request.getWinningAmount()) >= 0) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    "Discount amount cannot be equal to or greater than the winning amount",
                    HttpStatus.BAD_REQUEST);
        }

        BigDecimal netAmount = request.getWinningAmount().subtract(request.getDiscountAmount());

        Payout payout = Payout.builder()
                .chitId(request.getChitId())
                .memberId(request.getMemberId())
                .monthNumber(request.getMonthNumber())
                .winningAmount(request.getWinningAmount())
                .discountAmount(request.getDiscountAmount())
                .netPayoutAmount(netAmount)
                .notes(request.getNotes())
                .createdBy(adminId)
                .build();

        payoutRepository.save(payout);
        log.info("Payout created for member {} — chit {} month {} — net ₹{}",
                request.getMemberId(), request.getChitId(), request.getMonthNumber(), netAmount);

        eventPublisher.publish(new PayoutCreatedEvent(
                payout.getId().toString(),
                payout.getChitId().toString(),
                payout.getMemberId().toString(),
                payout.getMonthNumber(),
                payout.getWinningAmount(),
                payout.getDiscountAmount(),
                payout.getNetPayoutAmount(),
                adminId.toString(),
                Instant.now()
        ));

        return toResponse(payout);
    }

    /**
     * Admin records disbursement — the moment money leaves the admin's hands.
     * Supports partial disbursement: pass a lower `amount` to disburse in instalments.
     * Status becomes PARTIALLY_DISBURSED until the full netPayoutAmount is sent.
     */
    @Transactional
    public PayoutResponse disburse(UUID payoutId, DisburseRequest request, UUID adminId) {
        Payout payout = findOrThrow(payoutId);

        if (payout.getStatus() != PayoutStatus.PENDING && payout.getStatus() != PayoutStatus.PARTIALLY_DISBURSED) {
            throw new BusinessException(ErrorCode.PAYOUT_NOT_PENDING,
                    "Only PENDING or PARTIALLY_DISBURSED payouts can be disbursed — current status: " + payout.getStatus());
        }

        BigDecimal alreadyDisbursed = payout.getDisbursedAmount() != null ? payout.getDisbursedAmount() : BigDecimal.ZERO;
        BigDecimal remaining = payout.getNetPayoutAmount().subtract(alreadyDisbursed);

        // Default: disburse the full remaining amount
        BigDecimal thisAmount = (request.getAmount() != null) ? request.getAmount() : remaining;

        if (thisAmount.compareTo(BigDecimal.ZERO) <= 0) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    "Disbursement amount must be greater than zero", org.springframework.http.HttpStatus.BAD_REQUEST);
        }
        if (thisAmount.compareTo(remaining) > 0) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    "Cannot disburse more than the remaining amount ₹" + remaining, org.springframework.http.HttpStatus.BAD_REQUEST);
        }

        BigDecimal newDisbursed = alreadyDisbursed.add(thisAmount);
        boolean fullyDisbursed = newDisbursed.compareTo(payout.getNetPayoutAmount()) >= 0;

        payout.setDisbursedAmount(newDisbursed);
        payout.setStatus(fullyDisbursed ? PayoutStatus.DISBURSED : PayoutStatus.PARTIALLY_DISBURSED);
        payout.setDisbursementMode(request.getDisbursementMode());
        if (request.getReferenceNumber() != null) payout.setReferenceNumber(request.getReferenceNumber());
        payout.setDisbursedAt(LocalDateTime.now());
        payout.setDisbursedBy(adminId);
        if (request.getNotes() != null) payout.setNotes(request.getNotes());

        payoutRepository.save(payout);
        log.info("Payout {} — ₹{} disbursed (total so far: ₹{} / ₹{}) to member {} via {} status={}",
                payoutId, thisAmount, newDisbursed, payout.getNetPayoutAmount(),
                payout.getMemberId(), request.getDisbursementMode(), payout.getStatus());

        if (fullyDisbursed) {
            eventPublisher.publish(new PayoutDisbursedEvent(
                    payout.getId().toString(),
                    payout.getChitId().toString(),
                    payout.getMemberId().toString(),
                    payout.getMonthNumber(),
                    payout.getNetPayoutAmount(),
                    payout.getDisbursementMode().name(),
                    payout.getReferenceNumber(),
                    adminId.toString(),
                    Instant.now()
            ));
        }

        return toResponse(payout);
    }

    @Transactional
    public PayoutResponse cancel(UUID payoutId, CancelPayoutRequest request, UUID adminId) {
        Payout payout = findOrThrow(payoutId);

        if (payout.getStatus() == PayoutStatus.DISBURSED) {
            throw new BusinessException(ErrorCode.PAYOUT_ALREADY_DISBURSED,
                    "Cannot cancel a payout that has already been disbursed");
        }
        if (payout.getStatus() == PayoutStatus.PARTIALLY_DISBURSED) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    "Cannot cancel a partially disbursed payout — please disburse the remaining amount instead",
                    HttpStatus.BAD_REQUEST);
        }
        if (payout.getStatus() == PayoutStatus.CANCELLED) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    "Payout is already cancelled", HttpStatus.BAD_REQUEST);
        }

        payout.setStatus(PayoutStatus.CANCELLED);
        payout.setCancelledAt(LocalDateTime.now());
        payout.setCancelledBy(adminId);
        payout.setCancellationReason(request.getReason());

        payoutRepository.save(payout);
        log.info("Payout {} cancelled. Reason: {}", payoutId, request.getReason());

        return toResponse(payout);
    }

    @Transactional(readOnly = true)
    public PayoutResponse getById(UUID payoutId) {
        return toResponse(findOrThrow(payoutId));
    }

    // Admin dashboard: PENDING + PARTIALLY_DISBURSED payouts that still need action
    @Transactional(readOnly = true)
    public List<PayoutResponse> getPendingPayouts() {
        return payoutRepository.findByStatusInOrderByCreatedAtAsc(
                List.of(PayoutStatus.PENDING, PayoutStatus.PARTIALLY_DISBURSED))
                .stream().map(this::toResponse).toList();
    }

    // Full history for a chit — month 1 through N, who got paid, how much, when
    @Transactional(readOnly = true)
    public List<PayoutResponse> getPayoutsForChit(UUID chitId) {
        return payoutRepository.findByChitIdOrderByMonthNumberAsc(chitId)
                .stream().map(this::toResponse).toList();
    }

    // Member's complete winning history across all chits they've participated in
    @Transactional(readOnly = true)
    public List<PayoutResponse> getPayoutsForMember(UUID memberId) {
        return payoutRepository.findByMemberIdOrderByCreatedAtDesc(memberId)
                .stream().map(this::toResponse).toList();
    }

    @Transactional(readOnly = true)
    public List<PayoutResponse> getTodaysPayouts() {
        LocalDateTime start = LocalDate.now().atStartOfDay();
        LocalDateTime end   = start.plusDays(1);
        return payoutRepository.findTodaysPayouts(start, end)
                .stream().map(this::toResponse).toList();
    }

    private Payout findOrThrow(UUID id) {
        return payoutRepository.findById(id)
                .orElseThrow(() -> new BusinessException(ErrorCode.PAYOUT_NOT_FOUND,
                        "Payout not found: " + id));
    }

    private PayoutResponse toResponse(Payout p) {
        BigDecimal disbursed = p.getDisbursedAmount() != null ? p.getDisbursedAmount() : BigDecimal.ZERO;
        BigDecimal remaining = p.getNetPayoutAmount().subtract(disbursed);
        return PayoutResponse.builder()
                .id(p.getId())
                .chitId(p.getChitId())
                .memberId(p.getMemberId())
                .monthNumber(p.getMonthNumber())
                .winningAmount(p.getWinningAmount())
                .discountAmount(p.getDiscountAmount())
                .netPayoutAmount(p.getNetPayoutAmount())
                .disbursedAmount(disbursed)
                .remainingAmount(remaining.compareTo(BigDecimal.ZERO) < 0 ? BigDecimal.ZERO : remaining)
                .status(p.getStatus())
                .disbursementMode(p.getDisbursementMode())
                .referenceNumber(p.getReferenceNumber())
                .notes(p.getNotes())
                .createdBy(p.getCreatedBy())
                .createdAt(p.getCreatedAt())
                .disbursedAt(p.getDisbursedAt())
                .disbursedBy(p.getDisbursedBy())
                .cancelledAt(p.getCancelledAt())
                .cancelledBy(p.getCancelledBy())
                .cancellationReason(p.getCancellationReason())
                .updatedAt(p.getUpdatedAt())
                .build();
    }
}
