package com.chitfund.chitservice.strategy;

import com.chitfund.chitservice.domain.entity.Chit;
import com.chitfund.chitservice.dto.request.AssignWinnerRequest;
import com.chitfund.common.exception.BusinessException;
import com.chitfund.common.exception.ErrorCode;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.UUID;

/**
 * Records the winner determined by an external auction process.
 *
 * In an auction-based chit:
 * 1. Members verbally bid in a group meeting: "I'll take ₹17,000 from the ₹20,000 pot"
 * 2. The member who accepts the lowest amount wins
 * 3. The difference (₹3,000 discount) is distributed to all members as a dividend —
 *    effectively reducing everyone's next installment slightly
 *
 * This strategy's job is simple: validate that the auction winner is a real, eligible
 * member of this chit. The actual bidding happens offline or in a separate bidding service.
 * The manager then calls POST /winners with the result.
 */
@Component
public class AuctionWinnerStrategy implements WinnerSelectionStrategy {

    @Override
    public UUID selectWinner(Chit chit, List<UUID> eligibleMemberIds, AssignWinnerRequest request) {
        if (request.getWinnerId() == null) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED,
                    "winnerId is required for AUCTION mode");
        }
        if (!eligibleMemberIds.contains(request.getWinnerId())) {
            throw new BusinessException(ErrorCode.MEMBER_ALREADY_WON,
                    "The specified auction winner has already won in this chit or is not enrolled");
        }
        return request.getWinnerId();
    }
}
