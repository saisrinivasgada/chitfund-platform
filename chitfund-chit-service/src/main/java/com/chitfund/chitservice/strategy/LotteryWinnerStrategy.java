package com.chitfund.chitservice.strategy;

import com.chitfund.chitservice.domain.entity.Chit;
import com.chitfund.chitservice.dto.request.AssignWinnerRequest;
import com.chitfund.common.exception.BusinessException;
import com.chitfund.common.exception.ErrorCode;
import org.springframework.stereotype.Component;

import java.security.SecureRandom;
import java.util.List;
import java.util.UUID;

/**
 * Picks a random winner from members who haven't won yet.
 *
 * WHY SecureRandom instead of Random?
 * - java.util.Random uses a linear congruential generator — predictable if you
 *   know the seed. For financial selection, this is a security risk.
 * - SecureRandom uses OS-level entropy (e.g., /dev/urandom on Linux).
 *   Results are cryptographically unpredictable.
 * - INTERVIEW: "Use SecureRandom for anything security-sensitive: tokens,
 *   lottery draws, one-time passwords. Random is fine for non-security use cases."
 */
@Component
public class LotteryWinnerStrategy implements WinnerSelectionStrategy {

    private static final SecureRandom SECURE_RANDOM = new SecureRandom();

    @Override
    public UUID selectWinner(Chit chit, List<UUID> eligibleMemberIds, AssignWinnerRequest request) {
        if (eligibleMemberIds.isEmpty()) {
            throw new BusinessException(ErrorCode.CHIT_NOT_ACTIVE,
                    "No eligible members for lottery — all members have already won");
        }
        int index = SECURE_RANDOM.nextInt(eligibleMemberIds.size());
        return eligibleMemberIds.get(index);
    }
}
