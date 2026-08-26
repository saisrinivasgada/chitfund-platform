package com.chitfund.chitservice.repository;

import com.chitfund.chitservice.domain.entity.AuctionBid;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface AuctionBidRepository extends JpaRepository<AuctionBid, UUID> {

    List<AuctionBid> findByAuctionSessionIdOrderByDiscountOfferedDescBidTimeAsc(UUID auctionSessionId);

    Optional<AuctionBid> findTopByAuctionSessionIdOrderByDiscountOfferedDescBidTimeAsc(UUID auctionSessionId);

    boolean existsByAuctionSessionIdAndMemberId(UUID auctionSessionId, UUID memberId);
}
