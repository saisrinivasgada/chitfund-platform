package com.chitfund.chitservice.strategy;

import com.chitfund.chitservice.domain.enums.WinnerSelectionMode;
import com.chitfund.common.exception.BusinessException;
import com.chitfund.common.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.Map;

/**
 * Factory that maps WinnerSelectionMode → WinnerSelectionStrategy.
 *
 * FACTORY PATTERN:
 * The factory isolates the "which strategy do I use?" decision from the
 * "what does the strategy do?" logic. WinnerService just calls getStrategy(mode)
 * and uses the result — it doesn't know or care which concrete class it gets.
 *
 * WHY inject a Map<WinnerSelectionMode, WinnerSelectionStrategy>?
 * Spring auto-populates this map: the key is derived from the bean name convention.
 * But we're using enum keys, so we inject each strategy explicitly.
 *
 * Alternative: Use @Qualifier or a switch expression. The Map approach is cleaner
 * because adding a new strategy = add a new bean, update the map. No switch to modify.
 *
 * INTERVIEW: "This is Factory + Strategy combined. Factory decides WHICH strategy.
 * Strategy defines HOW it runs. Together they implement the Open/Closed Principle:
 * adding a new winner mode = new class + update factory map, zero changes elsewhere."
 */
@Component
@RequiredArgsConstructor
public class WinnerSelectionStrategyFactory {

    private final LotteryWinnerStrategy lotteryStrategy;
    private final AuctionWinnerStrategy auctionStrategy;
    private final ReservationWinnerStrategy reservationStrategy;

    private Map<WinnerSelectionMode, WinnerSelectionStrategy> strategies;

    // Lazy-init to avoid constructor circularity
    private Map<WinnerSelectionMode, WinnerSelectionStrategy> getStrategies() {
        if (strategies == null) {
            strategies = Map.of(
                    WinnerSelectionMode.LOTTERY,     lotteryStrategy,
                    WinnerSelectionMode.AUCTION,     auctionStrategy,
                    WinnerSelectionMode.RESERVATION, reservationStrategy
            );
        }
        return strategies;
    }

    public WinnerSelectionStrategy getStrategy(WinnerSelectionMode mode) {
        WinnerSelectionStrategy strategy = getStrategies().get(mode);
        if (strategy == null) {
            throw new BusinessException(ErrorCode.UNSUPPORTED_WINNER_SELECTION_MODE);
        }
        return strategy;
    }
}
