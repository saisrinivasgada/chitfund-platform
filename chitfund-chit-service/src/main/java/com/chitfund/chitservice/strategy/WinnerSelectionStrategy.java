package com.chitfund.chitservice.strategy;

import com.chitfund.chitservice.domain.entity.Chit;
import com.chitfund.chitservice.dto.request.AssignWinnerRequest;

import java.util.List;
import java.util.UUID;

/**
 * Strategy interface for selecting the monthly winner.
 *
 * STRATEGY PATTERN:
 * - Context: WinnerService (uses the strategy)
 * - Strategy: This interface
 * - Concrete strategies: LotteryWinnerStrategy, AuctionWinnerStrategy, ReservationWinnerStrategy
 * - Factory: WinnerSelectionStrategyFactory (maps WinnerSelectionMode → Strategy)
 *
 * WHY interface instead of abstract class?
 * - Interface = pure contract, no implementation inheritance baggage
 * - Easier to test: mock the interface, inject the mock
 * - Supports Java 8+ default methods if you need shared behavior later
 *
 * The pattern lets you add a new winner selection mode (e.g., BIDDING_PLATFORM)
 * without touching WinnerService or any existing strategy. That's the
 * Open/Closed Principle in action.
 */
public interface WinnerSelectionStrategy {

    /**
     * @param chit              the chit being processed
     * @param eligibleMemberIds members who haven't won yet
     * @param request           carries extra info (auction winner, discount amount)
     * @return the UUID of the selected winner
     */
    UUID selectWinner(Chit chit, List<UUID> eligibleMemberIds, AssignWinnerRequest request);
}
