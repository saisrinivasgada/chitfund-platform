package com.chitfund.chitservice.repository;

import com.chitfund.chitservice.domain.entity.AuctionSession;
import com.chitfund.chitservice.domain.enums.AuctionMode;
import com.chitfund.chitservice.domain.enums.AuctionStatus;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface AuctionSessionRepository extends JpaRepository<AuctionSession, UUID> {

    Optional<AuctionSession> findByChitIdAndMonthNumber(UUID chitId, Integer monthNumber);

    Optional<AuctionSession> findByIdAndChitIdAndTenantId(UUID id, UUID chitId, String tenantId);

    List<AuctionSession> findByChitIdOrderByMonthNumberAsc(UUID chitId);

    boolean existsByChitIdAndMonthNumberAndStatus(UUID chitId, Integer monthNumber, AuctionStatus status);

    List<AuctionSession> findByStatusAndAuctionModeAndClosesAtBefore(
            AuctionStatus status, AuctionMode mode, LocalDateTime cutoff);
}
