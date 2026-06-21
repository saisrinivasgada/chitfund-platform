package com.chitfund.chitservice.strategy;

import com.chitfund.chitservice.domain.entity.Chit;
import com.chitfund.chitservice.domain.entity.MonthReservation;
import com.chitfund.chitservice.dto.request.AssignWinnerRequest;
import com.chitfund.chitservice.repository.MonthReservationRepository;
import com.chitfund.common.exception.BusinessException;
import com.chitfund.common.exception.ErrorCode;
import com.chitfund.common.exception.ResourceNotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.UUID;

/**
 * Selects the winner by looking up who reserved this month.
 *
 * The reservation was created via POST /chits/{id}/reservations when the member
 * pre-booked their preferred month. Optimistic locking on MonthReservation ensures
 * only one member can reserve a given month.
 *
 * When the month arrives, this strategy finds the reservation and returns the member.
 */
@Component
@RequiredArgsConstructor
public class ReservationWinnerStrategy implements WinnerSelectionStrategy {

    private final MonthReservationRepository reservationRepository;

    @Override
    public UUID selectWinner(Chit chit, List<UUID> eligibleMemberIds, AssignWinnerRequest request) {
        // If an explicit winner is provided (e.g. extra payout member at cycle open),
        // trust the admin's choice and just validate eligibility.
        if (request.getWinnerId() != null) {
            if (!eligibleMemberIds.contains(request.getWinnerId())) {
                throw new BusinessException(ErrorCode.MEMBER_ALREADY_WON,
                        "The specified member has no remaining spots in this chit");
            }
            return request.getWinnerId();
        }

        // Default: find who reserved this month and confirm they are still eligible
        List<MonthReservation> slots = reservationRepository
                .findByChitIdAndMonthNumber(chit.getId(), request.getMonthNumber());
        MonthReservation reservation = slots.stream()
                .filter(r -> r.getMemberId() != null)
                .findFirst()
                .orElseThrow(() -> new ResourceNotFoundException(
                        "No reservation found for month " + request.getMonthNumber()));

        if (!eligibleMemberIds.contains(reservation.getMemberId())) {
            throw new BusinessException(ErrorCode.MEMBER_ALREADY_WON,
                    "The member who reserved this month has no remaining spots in this chit");
        }
        return reservation.getMemberId();
    }
}
